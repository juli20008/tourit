from app.models import db, User


def seed_users():
    try:
        if not User.query.filter_by(email='demo@aa.io').first():
            demo = User(
                username='Demo User', email='demo@aa.io', password='password')
            db.session.add(demo)
            print("  Added Demo User")

        if not User.query.filter_by(email='frances@aa.io').first():
            frances = User(
                username='Frances', email='frances@aa.io', password='password')
            db.session.add(frances)
            print("  Added Frances")

        if not User.query.filter_by(email='richard@aa.io').first():
            richard = User(
                username='Richard', email='richard@aa.io', password='password')
            db.session.add(richard)
            print("  Added Richard")

        agents_data = [
            {"username": "Anthony Huynh", "email": "agent1@user.com", "phone": "626-802-7776", "license_num": "02145055", "bio": "I've spent two decades excelling in the competitive landscape of Houston real estate, establishing a reputation as a well-respected and innovative agent.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00001.png", "broker_license": "01517139", "office": "Keller Williams OC Coastal Realty"},
            {"username": "Gang Lan", "email": "agent2@user.com", "phone": "626-802-7776", "license_num": "02188358", "bio": "As a San Diego native, I have intimate knowledge of the area and a strong desire to make my home, your home.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00002.png", "broker_license": "01908329", "office": "Your Home Sold Guaranteed Realty"},
            {"username": "Tyson Storr", "email": "agent3@user.com", "phone": "424-212-2321", "license_num": "02179872", "bio": "My business is built on communication, dedication, and transparency. This recipe has helped me rise to the top 5% of commercial real estate agents nationwide by sales volume.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00003.png", "broker_license": "01914434", "office": "Buckingham Investments, Inc."},
            {"username": "Brandon Conroy", "email": "agent10@user.com", "phone": "626-333-6302", "license_num": "02131845", "bio": "With my sharp knowledge of the local market, I've helped over 500 families in the Lakeview area find their dream home, and I'm confident I can help you find yours too.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00004.png", "broker_license": "01908329", "office": "Redfin"},
            {"username": "Mo Soliman", "email": "agent5@user.com", "phone": "661-488-4232", "license_num": "02187353", "bio": "Awarded Syracuse's #1 Top Sales Producer in 2021, Mo has built a reputation for her savvy negotiations, uncompromising integrity, and cutting-edge marketing strategies.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00005.png", "broker_license": "01878277", "office": "eXp Realty of California Inc"},
            {"username": "Moua Xiong", "email": "agent7@user.com", "phone": "559-349-0770", "license_num": "02152129", "bio": "As an Asheville native, I witnessed its great transformation â€“ from a boarded up and desolate downtown into a bustling metropolitan city that retains its small-town feel.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00006.png", "broker_license": "02022288", "office": "All State Homes"},
            {"username": "Joanna Ashkar", "email": "agent9@user.com", "phone": "818-293-7564", "license_num": "02072015", "bio": "#1 Top-Selling Agent of La Jolla Homes Overall and #1 La Jolla Listing Agent. Joanna gives you the best chance in this complicated market.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00007.png", "broker_license": "01517139", "office": "Douglas Elliman"},
            {"username": "Jennifer Bonilla", "email": "agent6@user.com", "phone": "213-399-1339", "license_num": "02177055", "bio": "I've spent two decades excelling in the competitive landscape of Houston real estate, establishing a reputation as a well-respected and innovative agent.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00008.png", "broker_license": "00951359", "office": "Rodeo Realty"},
            {"username": "Taylor Sledge", "email": "agent11@user.com", "phone": "949-370-4604", "license_num": "02161572", "bio": "With my sharp knowledge of the local market, I've helped over 500 families in the Lakeview area find their dream home, and I'm confident I can help you find yours.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00009.png", "broker_license": "01914434", "office": "eXp Realty of California Inc"},
            {"username": "Julie Noel", "email": "agent12@user.com", "phone": "626-206-6910", "license_num": "03003160", "bio": "When you combine Julie's real estate experience with her extensive training, her clients always win. She holds the ABR and CRB designations.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00010.png", "broker_license": "01405905", "office": "Greatland Appraisal Group"},
            {"username": "Michelle Mauer", "email": "agent13@user.com", "phone": "951-390-5033", "license_num": "01926224", "bio": "For nearly 30 years, Michelle has been hailed as 'the queen of coastal real estate.' She has amassed 2 billion in career sales.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00011.png", "broker_license": "01878277", "office": "Beverly & Company, Inc."},
            {"username": "Leslie Lopez", "email": "agent14@user.com", "phone": "760-662-0537", "license_num": "01812443", "bio": "Representing Mid-Peninsula homeowners, Leslie is committed to listening to clients' needs and utilizing keen negotiating skills.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00012.png", "broker_license": "00951359", "office": "Coldwell Banker Realty"},
            {"username": "Cyndie Iwasaki", "email": "agent15@user.com", "phone": "562-480-9884", "license_num": "01083801", "bio": "Cyndie is a dream catcher who helps new friends catch their dreams of buying and selling a wonderful home.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00013.png", "broker_license": "02022288", "office": "Iwasaki Realty Group"},
            {"username": "Olivia Bensan", "email": "agent8@user.com", "phone": "925-858-0906", "license_num": "01000679", "bio": "As a San Diego native, I have intimate knowledge of the area and a strong desire to make my home, your home.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00014.png", "broker_license": "01000679", "office": "Millennium Realty"},
            {"username": "Sarah Corliss", "email": "agent4@user.com", "phone": "707-616-7549", "license_num": "01405905", "bio": "Born and raised in Chicago to an architect and real estate investor, Anthony has the ideal foundation for selling homes.", "photo": "https://yillow.s3.us-west-1.amazonaws.com/agent/agents00015.png", "broker_license": "01405905", "office": "Forbes & Associates - Sarah Corliss"},
        ]

        for agent_data in agents_data:
            if not User.query.filter_by(email=agent_data['email']).first():
                agent = User(
                    username=agent_data['username'],
                    email=agent_data['email'],
                    password='password',
                    phone=agent_data['phone'],
                    agent=True,
                    license_num=agent_data['license_num'],
                    bio=agent_data['bio'],
                    photo=agent_data['photo'],
                    broker_license=agent_data['broker_license'],
                    office=agent_data['office']
                )
                db.session.add(agent)
                print(f"  Added agent: {agent_data['username']}")

        db.session.commit()
        print("[OK] Users seeded successfully!")
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Error seeding users: {e}")
        raise


def undo_users():
    db.session.execute('TRUNCATE users RESTART IDENTITY CASCADE;')
    db.session.commit()
