from flask_wtf import FlaskForm
from wtforms import StringField
from wtforms.validators import DataRequired, Length, ValidationError, Regexp
from app.models import AgentArea
from flask_login import current_user


class ServiceAreaForm(FlaskForm):
    zip = StringField("zip", validators=[
        DataRequired(),
        Regexp(
            r'^\d{5}$|^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$',
            message="Enter a valid US zip (12345) or Canadian postal code (A1A 1A1)"
        )
    ])
