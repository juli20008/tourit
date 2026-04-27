"""Update property images to use public placeholder images"""
from app import app, db
from app.models import PropertyImg

with app.app_context():
    # Get all property images
    images = PropertyImg.query.all()
    
    print(f"Updating {len(images)} property images...")
    
    for idx, img in enumerate(images):
        # Use picsum.photos for random house/interior images
        # This is a free placeholder image service
        image_id = (idx % 100) + 1
        img.img_url = f"https://picsum.photos/400/300?random={image_id}"
        db.session.add(img)
    
    db.session.commit()
    print("✓ All property images updated!")
    print("✓ Using public placeholder images from picsum.photos")
