from sqlalchemy import or_
from flask import Blueprint, jsonify, request
from sqlalchemy.orm import selectinload
from app.models import db, User, Property, Appointment, MlsListing
from flask_login import current_user, login_required
from datetime import datetime
from app.forms import AddAppointmentForm
from app.utils.availability import (
    agent_is_available,
    available_agents_for_slot,
    parse_date_time,
    pick_agent_for_appointment,
)

appointment_routes = Blueprint("appointments", __name__)

def validation_errors_to_error_messages(validation_errors):
    """
    Simple function that turns the WTForms validation errors into a simple list
    """
    errorMessages = []
    for field in validation_errors:
        for error in validation_errors[field]:
            errorMessages.append(f'{field} : {error}')
    return errorMessages


def is_future_datetime(date_str, time_str):
    return parse_date_time(date_str, time_str) >= datetime.now()




@appointment_routes.route("/", methods=["GET", "POST"])
@login_required
def add_appointment():

    if request.method == "GET":

        appointments = [appt.to_dict() for appt in current_user.appointments]
        property_ids = [appt.property_id for appt in current_user.appointments]
        properties = (
            Property.query.options(
                selectinload(Property.state),
                selectinload(Property.listing_agent),
                selectinload(Property.images),
            )
            .filter(Property.id.in_(property_ids))
            .all()
        )

        if current_user.agent:
            return {
                "appointments": appointments,
                "properties": [property.to_dict(include_appointments=False) for property in properties],
            }
        else:
            agent_ids = [appt.agent_id for appt in current_user.appointments]
            agents = User.query.filter(User.id.in_(agent_ids)).all()

            return {
                "appointments": appointments,
                "agents": [agent.to_dict() for agent in agents],
                "properties": [property.to_dict(include_appointments=False) for property in properties],
                }

    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        if payload:
            property_id = payload.get("property_id")
            date = payload.get("date")
            time = payload.get("time")
            message = payload.get("message")
            selected_agent_id = payload.get("agent_id")
        else:
            form = AddAppointmentForm()
            form["csrf_token"].data = request.cookies["csrf_token"]
            if not form.validate_on_submit():
                return {"errors": validation_errors_to_error_messages(form.errors)}, 401

            property_id = form.data["property_id"]
            date = form.data["date"]
            time = form.data["time"]
            message = form.data["message"]
            selected_agent_id = form.data.get("agent_id")

        if not property_id or not date or not time:
            return {"errors": ["property_id, date, and time are required"]}, 400

        # Resolve property_obj and determine which FK column to use
        mls_listing_id = None
        pid = None
        pid_str = str(property_id)

        if pid_str.startswith("mls_"):
            raw_id = pid_str[4:]
            try:
                mls_listing_id = int(raw_id)
            except ValueError:
                return {"errors": ["Invalid listing ID"]}, 400
            property_obj = MlsListing.query.get(mls_listing_id)
            if not property_obj:
                return {"errors": ["Listing not found"]}, 404
        else:
            try:
                pid = int(pid_str)
            except (ValueError, TypeError):
                return {"errors": ["Invalid property ID"]}, 400
            property_obj = Property.query.get(pid)
            if not property_obj:
                return {"errors": ["Property not found"]}, 404

        if not is_future_datetime(date, time):
            return {"errors": ["Date cannot be prior to current date"]}

        user_appt = Appointment.query.filter(
            Appointment.user_id == current_user.id,
            Appointment.date == date,
            Appointment.time == time,
        ).first()

        if user_appt:
            return {"errors": ["You already have another appointment at this timeslot"]}

        exists = Appointment.query.filter(
            Appointment.date == date,
            Appointment.time == time,
            Appointment.mls_listing_id == mls_listing_id if mls_listing_id else Appointment.property_id == pid,
        ).first()

        if exists:
            return {"errors": ["Timeslot not available"]}

        if selected_agent_id:
            selected_agent = User.query.get(selected_agent_id)
            if not selected_agent or not selected_agent.agent:
                return {"errors": ["Selected agent does not exist"]}
            if not agent_is_available(selected_agent.id, date, time):
                return {"errors": ["Selected agent is not available for that timeslot"]}
        else:
            selected_agent = pick_agent_for_appointment(property_obj, date, time)

        if not selected_agent:
            return {"errors": ["No agents are available for that timeslot"]}

        new_appointment = Appointment(
            user_id=current_user.id,
            date=date,
            time=time,
            message=message,
            property_id=pid,
            mls_listing_id=mls_listing_id,
            agent_id=selected_agent.id,
        )

        db.session.add(new_appointment)
        db.session.commit()

        return {"appointment": new_appointment.to_dict()}

@appointment_routes.route("/<int:appointment_id>", methods=["GET", "PUT", "DELETE"])
@login_required
def edit_appointment(appointment_id):

    if request.method == "GET":
        appt = Appointment.query \
            .filter(Appointment.id == appointment_id) \
            .filter(or_(Appointment.user_id == current_user.id, Appointment.agent_id == current_user.id)) \
            .first()
        if appt:
            return {"appointment": appt.to_dict()}
        else:
            return {"errors": ["Unauthorized"]}

    if request.method == "PUT":
        payload = request.get_json(silent=True) or {}
        if payload:
            property_id = payload.get("property_id")
            date = payload.get("date")
            time = payload.get("time")
            message = payload.get("message")
        else:
            form = AddAppointmentForm()
            form["csrf_token"].data = request.cookies["csrf_token"]
            if not form.validate_on_submit():
                return {'errors': validation_errors_to_error_messages(form.errors)}, 401

            property_id = form.data["property_id"]
            date = form.data["date"]
            time = form.data["time"]
            message = form.data["message"]

            # check if property exits
            property = Property.query.get(property_id)

            if not property:
                return {"errors": ["Property does not exists"]}

            if not is_future_datetime(date, time):
                return {"errors": ["Date cannot be prior to current date"]}


            # Make sure the appointment id belongs to user
        update_appt = Appointment.query \
            .filter(Appointment.id == appointment_id) \
            .filter(or_(Appointment.user_id == current_user.id, Appointment.agent_id == current_user.id)) \
            .first()

        if not update_appt:
            return {"errors": ["Appointment does not exist"]}

        assigned_agent_id = update_appt.agent_id

        if assigned_agent_id and not agent_is_available(assigned_agent_id, date, time, appointment_id=appointment_id):
            return {"errors": ["Assigned agent is not available for that timeslot"]}


        if current_user.agent:
            # Check agent appointment to see if overlaps
            agent_appt = Appointment.query.filter(
                Appointment.agent_id == current_user.id,
                Appointment.date == date,
                Appointment.time == time,
                Appointment.id != appointment_id)\
                .first()

            if agent_appt:
                return {"errors": ["You already have another appointment at this timeslot"]}

            client_appt = Appointment.query.filter(
                Appointment.user_id == update_appt.user_id,
                Appointment.date == date,
                Appointment.time == time,
                Appointment.id != appointment_id)\
                .first()

            if client_appt:
                return {"errors": ["Client has another appointment at this timeslot"]}

        else:
            user_appt = Appointment.query.filter(
                Appointment.user_id == current_user.id,
                Appointment.date == date,
                Appointment.time == time,
                Appointment.id != appointment_id)\
                .first()

            if user_appt:
                return {"errors": ["You already have another appointment at this timeslot"]}

            agent_appt = Appointment.query.filter(
                Appointment.agent_id == update_appt.agent_id,
                Appointment.date == date,
                Appointment.time == time,
                Appointment.id != appointment_id)\
                .first()

            if agent_appt:
                return {"errors": ["Agent has another appointment at this timeslot"]}

            # query for to see if it is not avaliable
        exists = Appointment.query.filter(
            Appointment.id != appointment_id,
            Appointment.property_id == property_id,
            Appointment.date == date,
            Appointment.time == time)\
            .first()

        if exists:
            return {"errors": ["Timeslot not avaliable"]}


        update_appt.date = date
        update_appt.time = time
        update_appt.message = message

        db.session.commit()
        return {
            "appointment": update_appt.to_dict()
        }

    if request.method == "DELETE":
        appt = Appointment.query.filter(Appointment.id == appointment_id).filter(or_(Appointment.user_id == current_user.id, Appointment.agent_id == current_user.id)).first()

        if appt:
            db.session.delete(appt)
            db.session.commit()
            return {"success": "success"}

        return {'errors': ['Unauthorized']}, 401


@appointment_routes.route("/available-agents", methods=["GET"])
@login_required
def get_available_agents():
    date = request.args.get("date")
    time = request.args.get("time")
    property_id = request.args.get("property_id", type=int)

    if not date or not time:
        return {"errors": ["date and time are required"]}, 400

    property_obj = Property.query.get(property_id) if property_id else None
    agents = available_agents_for_slot(date, time, property_obj=property_obj)

    return {"agents": [agent.to_dict() for agent in agents]}


@appointment_routes.route("/<int:appointment_id>/assign", methods=["PUT"])
@login_required
def assign_agent(appointment_id):
    if not current_user.agent:
        return {"errors": ["Unauthorized"]}, 401

    appt = Appointment.query.filter(
        Appointment.id == appointment_id,
        Appointment.agent_id == current_user.id,
    ).first()

    if not appt:
        return {"errors": ["Appointment does not exist"]}, 404

    payload = request.get_json(silent=True) or {}
    new_agent_id = payload.get("agent_id")

    if not new_agent_id:
        return {"errors": ["agent_id is required"]}, 400

    new_agent = User.query.filter(User.id == new_agent_id, User.agent == True).first()

    if not new_agent:
        return {"errors": ["Agent does not exist"]}, 404

    if not agent_is_available(new_agent.id, appt.date, appt.time, appointment_id=appt.id):
        return {"errors": ["Agent is not available for that timeslot"]}, 400

    appt.agent_id = new_agent.id
    db.session.commit()

    return {"appointment": appt.to_dict()}
