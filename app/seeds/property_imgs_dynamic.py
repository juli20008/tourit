from app.models import db, PropertyImg, Property

_ROOM_TYPES = [
    ('living', 'Living Room'),
    ('kitchen', 'Kitchen'),
    ('yard', 'Yard'),
]
_IMG_BASE = 'https://yillow.s3.us-west-1.amazonaws.com/properties'
_NUM_SETS = 10


def seed_property_imgs():
    if PropertyImg.query.count() > 0:
        print('[OK] PropertyImgs already seeded, skipping...')
        return

    properties = Property.query.order_by(Property.id).all()
    imgs = []
    for prop in properties:
        n = ((prop.id - 1) % _NUM_SETS) + 1
        for prefix, desc in _ROOM_TYPES:
            imgs.append(PropertyImg(
                property_id=prop.id,
                img_url=f'{_IMG_BASE}/{prefix}{n:03d}.jpeg',
                description=desc,
            ))

    db.session.add_all(imgs)
    db.session.commit()
    print(f'[OK] PropertyImgs seeded: {len(imgs)} images for {len(properties)} properties')


def undo_property_imgs():
    PropertyImg.query.delete()
    db.session.commit()
