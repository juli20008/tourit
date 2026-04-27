from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.models import User, Review, AgentAvailability, db

agent_routes = Blueprint('agents', __name__)

@agent_routes.route("/")
def get_all_agents():
    agents = User.query.filter(User.agent == True).limit(100).all()
    return {"agents": [agent.to_dict() for agent in agents]}


@agent_routes.route("/<int:agent_id>")
def get_agent(agent_id):
    agent = User.query.filter(User.id == agent_id, User.agent == True).first()
    if agent:
        return {"agent": agent.to_dict()}
    else:
        return {"errors": ["Agent does not exist"]}, 404


@agent_routes.route("/<int:agent_id>/reviews", methods=["GET"])
def agent_reviews(agent_id):
    agent = User.query.get(agent_id)

    if agent.agent != True:
        return {"errors": ["Agent does not exist"]}, 404

    reviews = Review.query.filter(Review.agent_id == agent_id).all()

    return {"reviews": [review.to_dict() for review in reviews]}


@agent_routes.route("/me/availability", methods=["GET", "PUT"])
@login_required
def my_availability():
    if not current_user.agent:
        return {"errors": ["Unauthorized"]}, 401

    if request.method == "GET":
        return {
            "availability": [availability.to_dict() for availability in current_user.availabilities]
        }

    payload = request.get_json(silent=True) or {}
    availability_blocks = payload.get("availability", [])

    if not isinstance(availability_blocks, list):
        return {"errors": ["availability must be a list"]}, 400

    for block in availability_blocks:
        weekday = block.get("weekday")
        start_time = block.get("start_time")
        end_time = block.get("end_time")

        if weekday is None or start_time is None or end_time is None:
            return {"errors": ["Each availability block needs weekday, start_time, and end_time"]}, 400

        if not isinstance(weekday, int) or weekday < 0 or weekday > 6:
            return {"errors": ["weekday must be an integer from 0 (Monday) to 6 (Sunday)"]}, 400

        if len(start_time) != 5 or len(end_time) != 5:
            return {"errors": ["start_time and end_time must use HH:MM format"]}, 400

        if start_time >= end_time:
            return {"errors": ["start_time must be before end_time"]}, 400

    AgentAvailability.query.filter(AgentAvailability.agent_id == current_user.id).delete()

    for block in availability_blocks:
        availability = AgentAvailability(
            agent_id=current_user.id,
            weekday=block["weekday"],
            start_time=block["start_time"],
            end_time=block["end_time"],
        )
        db.session.add(availability)

    db.session.commit()

    return {
        "availability": [availability.to_dict() for availability in current_user.availabilities]
    }
