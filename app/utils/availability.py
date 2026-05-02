import os
from datetime import datetime

from sqlalchemy.exc import OperationalError

from app.models import Appointment, AgentAvailability, AgentArea, Property, User

FALLBACK_AGENT_EMAIL = os.environ.get("FALLBACK_AGENT_EMAIL", "julie.li.realtor@gmail.com")


def _fallback_agent():
    """Return the designated fallback agent regardless of availability schedule."""
    return User.query.filter_by(email=FALLBACK_AGENT_EMAIL, agent=True).first()

DEFAULT_START_MINUTES = 9 * 60
DEFAULT_END_MINUTES = 17 * 60


def parse_date_time(date_str, time_str):
    year, month, day = [int(part) for part in date_str.split("-")]
    hour, minute = [int(part) for part in time_str.split(":")]
    return datetime(year, month, day, hour, minute)


def time_to_minutes(time_str):
    hour, minute = [int(part) for part in time_str.split(":")]
    return hour * 60 + minute


def date_weekday(date_str):
    year, month, day = [int(part) for part in date_str.split("-")]
    return datetime(year, month, day).weekday()


def agent_has_schedule(agent_id, date_str, time_str):
    weekday = date_weekday(date_str)
    slot_minutes = time_to_minutes(time_str)
    try:
        availabilities = AgentAvailability.query.filter(
            AgentAvailability.agent_id == agent_id,
            AgentAvailability.weekday == weekday,
        ).all()

        for availability in availabilities:
            if time_to_minutes(availability.start_time) <= slot_minutes < time_to_minutes(availability.end_time):
                return True

        return False
    except OperationalError:
        return weekday < 5 and DEFAULT_START_MINUTES <= slot_minutes < DEFAULT_END_MINUTES


def agent_has_conflict(agent_id, date_str, time_str, appointment_id=None):
    conflict = Appointment.query.filter(
        Appointment.agent_id == agent_id,
        Appointment.date == date_str,
        Appointment.time == time_str,
    )

    if appointment_id is not None:
        conflict = conflict.filter(Appointment.id != appointment_id)

    return conflict.first() is not None


def agent_is_available(agent_id, date_str, time_str, appointment_id=None):
    return agent_has_schedule(agent_id, date_str, time_str) and not agent_has_conflict(
        agent_id, date_str, time_str, appointment_id=appointment_id
    )


def candidate_agent_ids_for_property(property_obj):
    agent_ids = []

    if property_obj and getattr(property_obj, 'listing_agent_id', None):
        agent_ids.append(property_obj.listing_agent_id)

    if property_obj and property_obj.zip:
        same_zip_agents = [
            area.agent_id
            for area in AgentArea.query.filter(AgentArea.zip == property_obj.zip).all()
        ]
        agent_ids.extend(same_zip_agents)

    all_agent_ids = [agent.id for agent in User.query.filter(User.agent == True).all()]
    agent_ids.extend(all_agent_ids)

    ordered_ids = []
    seen = set()
    for agent_id in agent_ids:
        if agent_id not in seen:
            seen.add(agent_id)
            ordered_ids.append(agent_id)

    return ordered_ids


def available_agents_for_slot(date_str, time_str, property_obj=None, appointment_id=None):
    candidates = candidate_agent_ids_for_property(property_obj)
    available_ids = []
    for agent_id in candidates:
        try:
            is_available = agent_is_available(agent_id, date_str, time_str, appointment_id=appointment_id)
        except OperationalError:
            weekday = date_weekday(date_str)
            slot_minutes = time_to_minutes(time_str)
            is_available = weekday < 5 and DEFAULT_START_MINUTES <= slot_minutes < DEFAULT_END_MINUTES

        if is_available:
            available_ids.append(agent_id)

    if not available_ids:
        return []

    agents = User.query.filter(User.id.in_(available_ids), User.agent == True).all()
    agents_by_id = {agent.id: agent for agent in agents}
    return [agents_by_id[agent_id] for agent_id in available_ids if agent_id in agents_by_id]


def agent_rating(agent):
    """Average review score for an agent; 0.0 when no reviews exist."""
    ratings = [r.rating for r in agent.agent_reviews]
    return sum(ratings) / len(ratings) if ratings else 0.0


def pick_agent_for_appointment(property_obj, date_str, time_str):
    """
    Tier 1 lead distribution — Phase 1 (Primary Match):

    1. Service area: find agents whose designated zip covers the property's zip.
    2. Availability: filter to those available for the requested slot.
    3. Tie-break: assign the one with the highest Client Review Score.

    Falls back to any available agent (sorted by rating) when no service-area
    agent is available for the slot.
    """
    # Phase 1 – service-area agents who are available, best rating first
    prop_zip = getattr(property_obj, 'zip', None) if property_obj else None
    if prop_zip:
        service_area_ids = {
            area.agent_id
            for area in AgentArea.query.filter(AgentArea.zip == prop_zip).all()
        }
        if service_area_ids:
            candidates = User.query.filter(
                User.id.in_(service_area_ids),
                User.agent == True,
            ).all()
            phase1 = [
                a for a in candidates
                if agent_is_available(a.id, date_str, time_str)
            ]
            if phase1:
                return max(phase1, key=agent_rating)

    # Phase 2 – geographic proximity fallback
    available = available_agents_for_slot(date_str, time_str, property_obj=property_obj)
    if not available:
        return _fallback_agent()

    prop_lat = getattr(property_obj, 'lat', None) if property_obj else None
    # Property uses column "long"; MlsListing uses "lng"
    prop_lng = (
        getattr(property_obj, 'lng', None) or getattr(property_obj, 'long', None)
    ) if property_obj else None

    if prop_lat is not None and prop_lng is not None:
        from app.utils.geo import agent_centroid, haversine

        def proximity_key(agent):
            centroid = agent_centroid(agent)
            if centroid is None:
                return (float('inf'), -agent_rating(agent))
            dist = haversine(float(prop_lat), float(prop_lng), centroid[0], centroid[1])
            return (dist, -agent_rating(agent))

        return min(available, key=proximity_key)

    return max(available, key=agent_rating) or _fallback_agent()
