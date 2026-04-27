from app import app
print('✓ App imports successfully')
print('\nDatabase Configuration:')
print(f'  SQLALCHEMY_DATABASE_URI: {app.config.get("SQLALCHEMY_DATABASE_URI", "NOT SET")}')
print(f'  SQLALCHEMY_TRACK_MODIFICATIONS: {app.config.get("SQLALCHEMY_TRACK_MODIFICATIONS")}')
print(f'  SQLALCHEMY_ECHO: {app.config.get("SQLALCHEMY_ECHO")}')
