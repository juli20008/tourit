from flask import Blueprint, jsonify, request
from sqlalchemy.orm import selectinload
from app.models import Property
from app.models import User
from app.models.mls_listing import MlsListing

property_routes = Blueprint('properties', __name__)

# @property_routes.route("/search", methods=["GET", 'POST'])
# def search():
#     properties = Property.query.limit(200).all()
#     return {
#         "properties": [property.to_dict() for property in properties],
#         }

@property_routes.route("/feed")
def property_feed():
    properties = (
        Property.query.options(
            selectinload(Property.state),
            selectinload(Property.listing_agent),
            selectinload(Property.images),
        )
        .order_by(Property.listing_date.desc(), Property.price.asc())
        .all()
    )

    return {
        "properties": [property.to_dict(include_appointments=False) for property in properties],
    }

@property_routes.route("/<int:property_id>")
def get_property(property_id):

    property = Property.query.get(property_id)

    if property:
        return {"property": property.to_dict()}
    else:
        return {"errors": ["Something went wrong. Please try again"]}

@property_routes.route("/<int:property_id>/images")
def property_imgs(property_id):
    property = Property.query.get(property_id)
    return {
        "images": [image.to_dict() for image in property.images]
    }


@property_routes.route("/mls_<int:mls_id>/images")
def mls_property_imgs(mls_id):
    """
    Serves images for MLS listings. The frontend calls
    getAllImages(property.id) where id is 'mls_<n>', which maps here.
    Returns synthetic image objects with the same {id, img_url} shape
    as PropertyImg.to_dict() so the Images component renders unchanged.
    """
    listing = MlsListing.query.get(mls_id)
    if not listing:
        return {"images": []}
    imgs = listing.images or []
    return {
        "images": [
            {"id": f"mls-img-{mls_id}-{i}", "img_url": url}
            for i, url in enumerate(imgs)
        ]
    }
