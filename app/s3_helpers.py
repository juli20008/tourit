import os
import uuid

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "gif"}

def get_s3_client():
    bucket_name = os.environ.get("S3_BUCKET")
    s3_key = os.environ.get("S3_KEY")
    s3_secret = os.environ.get("S3_SECRET")

    if not bucket_name or not s3_key or not s3_secret:
        return None, None

    import boto3

    return boto3.client(
        "s3",
        aws_access_key_id=s3_key,
        aws_secret_access_key=s3_secret
    ), bucket_name


def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_unique_filename(filename):
    ext = filename.rsplit(".", 1)[1].lower()
    unique_filename = uuid.uuid4().hex
    return f"{unique_filename}.{ext}"


def upload_file_to_s3(file, acl="public-read"):
    s3, bucket_name = get_s3_client()
    if not s3 or not bucket_name:
        return {"errors": "S3 is not configured"}

    try:
        s3.upload_fileobj(
            file,
            bucket_name,
            file.filename,
            ExtraArgs={
                "ACL": acl,
                "ContentType": file.content_type
            }
        )
    except Exception as e:
        # in case the our s3 upload fails
        return {"errors": str(e)}

    return {"url": f"https://{bucket_name}.s3.amazonaws.com/{file.filename}"}
