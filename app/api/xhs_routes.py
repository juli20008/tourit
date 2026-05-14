import os
import requests
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

xhs_routes = Blueprint('xhs', __name__)


@xhs_routes.route('/rewrite', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*')
def rewrite_for_xhs():
    """Generate a 小红书-style post from listing data via DeepSeek."""
    if request.method == 'OPTIONS':
        return '', 204

    api_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'AI rewrite not configured'}), 503

    data = request.get_json(silent=True) or {}
    listing       = data.get('listing', {})
    city_zh       = data.get('city_zh', '') or listing.get('city', '多伦多')
    type_zh       = data.get('type_zh', '') or '住宅'
    translated_desc = data.get('translated_desc', '') or '（无描述）'

    price  = f"{int(listing.get('price') or 0):,}"
    beds   = listing.get('beds', '?')
    baths  = listing.get('baths', '?')
    mls    = listing.get('mls_number', '')

    prompt = f"""你是一位在加拿大多伦多从业多年的华人房产经纪，专门帮助华人买家找到心仪的房子。请根据以下房源信息，用小红书风格写一篇真实生动的购房推荐帖。

房源信息：
城市/区域：{city_zh}
地址：{listing.get('address', '')}
房型：{type_zh}
卧室：{beds} 间
卫生间：{baths} 间
售价：${price} 加元
房源描述：{translated_desc}
预约看房：tourit.ca/listing/{mls}

写作要求：
- 分4段，段与段之间空一行
- 第一段：一句话勾起读者好奇心，结合区域特色（如士嘉堡提中文生活圈，密西沙加提购物方便，北约克提交通便利）
- 第二段：房源2-3个最吸引人的亮点，语气真诚具体，不要虚构
- 第三段：售价性价比分析，说明适合哪类买家（首次置业/换房家庭/投资客等）
- 第四段：预约看房信息，附 tourit.ca 链接，提醒优质房源抢手
- 最后一行：8-10个 hashtag，含具体城市和房型标签，用买房/置业而非租房
- 总字数 200-320 字，每段最多 2 个 emoji，位置自然
- 不要虚构任何未在描述中提到的设施或特点"""

    try:
        resp = requests.post(
            'https://api.deepseek.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'deepseek-chat',
                'max_tokens': 1024,
                'messages': [{'role': 'user', 'content': prompt}],
            },
            timeout=30,
        )
        if not resp.ok:
            return jsonify({'error': f'DeepSeek error {resp.status_code}'}), 502

        text = resp.json().get('choices', [{}])[0].get('message', {}).get('content', '').strip()
        return jsonify({'text': text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500
