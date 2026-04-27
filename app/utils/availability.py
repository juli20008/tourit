from datetime import datetime

from sqlalchemy.exc import OperationalError

from app.models import Appointment, AgentAvailability, AgentArea, Property, User

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


def pick_agent_for_appointment(property_obj, date_str, time_str):
    available_agents = available_agents_for_slot(date_str, time_str, property_obj=property_obj)
    if not available_agents:
        return None
    return available_agents[0]
