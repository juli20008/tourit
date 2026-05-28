import os
from datetime import datetime

from sqlalchemy.exc import OperationalError

from app.models import Appointment, AgentAvailability, AgentArea, Property, User

FALLBACK_AGENT_EMAIL = os.environ.get("FALLBACK_AGENT_EMAIL", "julie.li.realtor@gmail.com")


def _fallback_agent():
    """Return the designated fallback agent. Auto-promotes to agent=True if needed."""
    user = User.query.filter_by(email=FALLBACK_AGENT_EMAIL).first()
    if user is None:
        return None
    if not user.agent:
        user.agent = True
        try:
            from app.models import db as _db
            _db.session.commit()
        except Exception:
            _db.session.rollback()
            return None
    return user

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


def _prop_fsa(property_obj):
    """Return the 3-char FSA for a property's postal code, or None."""
    zip_code = getattr(property_obj, 'zip', None) if property_obj else None
    if not zip_code:
        return None
    clean = str(zip_code).strip().upper().replace(" ", "")
    return clean[:3] if len(clean) >= 3 else None


def candidate_agent_ids_for_property(property_obj):
    """Return ordered candidate agent IDs for lead assignment.

    Priority: agents whose FSA service area covers the property → all agents.
    """
    agent_ids = []

    if property_obj and getattr(property_obj, 'listing_agent_id', None):
        agent_ids.append(property_obj.listing_agent_id)

    prop_fsa = _prop_fsa(property_obj)
    if prop_fsa:
        fsa_agent_ids = [
            area.agent_id
            for area in AgentArea.query.all()
            if area.zip and area.zip[:3].upper() == prop_fsa
        ]
        agent_ids.extend(fsa_agent_ids)

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
    Lead assignment logic:

    All non-whitelabel bookings currently go directly to the fallback agent
    (Julie Li). Whitelabel/referral bookings are handled upstream via the
    selected_agent_id path and never reach this function.

    FSA-based postal code distribution is preserved below for future use.
    """
    return _fallback_agent()

    # ── FSA distribution (preserved, not active) ─────────────────────────────
    # prop_fsa = _prop_fsa(property_obj)
    # if prop_fsa:
    #     all_areas = AgentArea.query.all()
    #     fsa_agent_ids = {
    #         area.agent_id
    #         for area in all_areas
    #         if area.zip and area.zip[:3].upper() == prop_fsa
    #     }
    #     if fsa_agent_ids:
    #         candidates = User.query.filter(
    #             User.id.in_(fsa_agent_ids), User.agent == True,
    #         ).all()
    #         available = [
    #             a for a in candidates
    #             if agent_is_available(a.id, date_str, time_str)
    #         ]
    #         if available:
    #             return max(available, key=agent_rating)
    # return _fallback_agent()
