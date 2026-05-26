import logging
import requests

log = logging.getLogger(__name__)

_YRDSB_API = "https://schoollocator.yrdsb.ca/ws/api/SchoolsProfiles"
# Key is publicly embedded in https://schoollocator.yrdsb.ca/JavaScript/GetSchoolProfiles.js
_YRDSB_KEY = "WLxv!Z3R96Q#CUc!"

_YORK_CITIES = {
    "aurora", "east gwillimbury", "georgina", "king", "markham",
    "newmarket", "richmond hill", "vaughan",
    "whitchurch-stouffville", "stouffville",
}


def lookup_yrdsb_schools(street_number, street_name, street_suffix, city):
    """Return assigned YRDSB schools for a York Region address.

    Returns a dict like:
      {"elementary": "Some PS", "secondary": "Some SS",
       "fi_elementary": "...", "fi_secondary": "..."}
    or None if the city is outside York Region or the lookup fails.
    """
    if not city or city.strip().lower() not in _YORK_CITIES:
        return None

    full_street = " ".join(filter(None, [
        (street_name or "").strip(),
        (street_suffix or "").strip(),
    ]))
    if not street_number or not full_street:
        return None

    payload = {
        "streetNumber":   str(street_number).strip(),
        "streetName":     full_street,
        "municipality":   city.strip(),
        "elementary_flag": True,
        "secondary_flag":  True,
        "elem_fi_flag":    True,
        "sec_fi_flag":     True,
        "sec_art_flag":    False,
        "ib_flag":         False,
        "ifReturnSchoolYear": False,
    }

    try:
        resp = requests.post(
            _YRDSB_API,
            json=payload,
            headers={"Content-Type": "application/json", "ApiKey_0": _YRDSB_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        log.debug("YRDSB response for %s %s: %s", street_number, full_street, data)
        return _parse(data)
    except Exception as exc:
        log.warning("YRDSB school lookup failed for %s %s %s: %s",
                    street_number, full_street, city, exc)
        return None


# ---------------------------------------------------------------------------
# Response parsing — YRDSB returns JSON whose exact shape is undocumented;
# handle several common patterns defensively.
# ---------------------------------------------------------------------------

def _name(d):
    for key in ("SchoolName", "schoolName", "name", "Name", "school_name", "SchoolLongName"):
        if d.get(key):
            return d[key]
    return None


def _classify(key):
    """Return 'elementary' or 'secondary' from a dict key or type string."""
    k = key.lower()
    if "element" in k or "elem" in k or "primary" in k or "junior" in k:
        return "elementary"
    if "second" in k or "high" in k or "senior" in k:
        return "secondary"
    return None


def _is_fi(key):
    k = key.lower()
    return "french" in k or " fi" in k or "_fi" in k or "immersion" in k


def _parse(data):
    result = {}
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                _absorb(item, result)
    elif isinstance(data, dict):
        # Try top-level keys like ElementarySchool, SecondarySchool, etc.
        for key, val in data.items():
            if isinstance(val, dict):
                lvl = _classify(key)
                fi  = _is_fi(key)
                name = _name(val)
                if lvl and name:
                    slot = ("fi_" + lvl) if fi else lvl
                    result.setdefault(slot, name)
            elif isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        _absorb(item, result)
            elif isinstance(val, str) and val:
                lvl = _classify(key)
                fi  = _is_fi(key)
                if lvl:
                    slot = ("fi_" + lvl) if fi else lvl
                    result.setdefault(slot, val)
    return result or None


def _absorb(school, result):
    name = _name(school)
    if not name:
        return
    raw_type = str(school.get("SchoolType", school.get("schoolType",
                   school.get("type", school.get("Type", "")))))
    lvl = _classify(raw_type)
    fi  = _is_fi(raw_type) or _is_fi(name)
    if lvl:
        slot = ("fi_" + lvl) if fi else lvl
        result.setdefault(slot, name)
