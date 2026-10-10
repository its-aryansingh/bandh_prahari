"""The words people read: warning levels, signs, buttons, and the footer every public reply carries.

Hindi first. The same steps as web/src/content.ts, so the page and the phones say the same thing.
"""

from __future__ import annotations

HELPLINES = "1070 / 1800 345 6145"
STUDENT_HI = "यह एक छात्र परियोजना है, सरकारी चेतावनी नहीं।"
STUDENT_EN = "A student project, not an official warning."

LEVELS = {
    "saavdhan": {
        "hi": "सावधान",
        "en": "Watch",
        "cap": "Monitor",
        "steps_hi": [
            "आधार, पासबुक, राशन कार्ड और ज़मीन के कागज़ प्लास्टिक की थैली में",
            "तीन दिन का सूखा खाना (चूड़ा, गुड़, सत्तू) और पानी",
            "फ़ोन और टॉर्च चार्ज",
            "तय कर लें कि मवेशी कहाँ जाएँगे",
        ],
        "steps_en": [
            "Aadhaar, passbook, ration card and land papers in a plastic bag",
            "Dry food for three days (chura, gur, sattu) and water",
            "Phone and torch charged",
            "Decide where the cattle would go",
        ],
    },
    "taiyaar": {
        "hi": "तैयार रहें",
        "en": "Get ready",
        "cap": "Prepare",
        "steps_hi": [
            "अनाज, बीज और चारा मचान या छत पर",
            "मवेशी खोलकर ऊँची जगह ले जाएँ",
            "कागज़ात अपने पास रखें",
            "बुज़ुर्ग, बच्चे, गर्भवती महिलाएँ और जो चल नहीं सकते, ऊँचाई के पास वाले घर में",
        ],
        "steps_en": [
            "Grain, seed and fodder onto the machaan or roof",
            "Untie the cattle and take them to high ground",
            "Keep the papers on you",
            "The elderly, children, pregnant women and anyone who can't walk at the house nearest high ground",
        ],
    },
    "nikal_chalo": {
        "hi": "निकल चलो",
        "en": "Move now",
        "cap": "Evacuate",
        "steps_hi": ["राहत शिविर या ऊँची जगह जाएँ, सबसे कमज़ोर पहले", "बिजली का मेन स्विच बंद", "कागज़ात साथ लें"],
        "steps_en": ["Go to the relief camp or high ground, the most vulnerable first", "Power off at the main", "Take the papers"],
    },
    "khatra_tala": {
        "hi": "ख़तरा टला",
        "en": "All clear",
        "cap": "AllClear",
        "steps_hi": ["घर लौटें", "दीवारें और कुआँ जाँच लें"],
        "steps_en": ["Go home", "Check the walls and the well"],
    },
}

SIGNS = {
    "overtopping": ("ऊपर से पानी", "Overtopping"),
    "boil_soil": ("मिट्टी वाला उबाल", "Boil carrying soil"),
    "top_slumping": ("ऊपरी सतह धँसना", "Top slumping"),
    "boil_clear": ("साफ़ पानी का उबाल", "Boil, clear water"),
    "slip": ("ढलान खिसकना", "Slope slip"),
    "crack": ("ऊपर दरार", "Crack on top"),
    "seepage_soil": ("रिसाव, मिट्टी के साथ", "Seepage with soil"),
    "seepage_clear": ("रिसाव, साफ़ पानी", "Seepage, clear"),
    "rathole": ("चूहे के बिल", "Rat holes"),
}

# Buttons: WhatsApp allows at most 3, titles up to 20 characters.
BUTTONS = {
    "onway": ("मैं जा रहा हूँ", "On my way"),
    "notmine": ("मेरा क्षेत्र नहीं", "Not my stretch"),
    "onsite": ("मैं पहुँच गया", "I'm on site"),
    "secured": ("सुरक्षित", "Secured"),
    "breached": ("टूट गया", "Breached"),
    "holding": ("डटे हैं", "Holding"),
    "ready": ("हो गया", "Done"),
}


def sign_hi(sign: str) -> str:
    return SIGNS.get(sign, (sign, sign))[0]


def sign_en(sign: str) -> str:
    return SIGNS.get(sign, (sign, sign))[1]


def footer(source_hi: str = "", source_en: str = "") -> tuple[str, str]:
    """What every public reply ends with: the source and time, the student note, the helplines."""
    hi = "\n".join(x for x in (source_hi, STUDENT_HI, f"आपातकाल में: {HELPLINES}") if x)
    en = "\n".join(x for x in (source_en, STUDENT_EN, f"In an emergency: {HELPLINES}") if x)
    return hi, en


def level_message(level: str, km: int, camp_hi: str = "", camp_en: str = "") -> tuple[str, str]:
    """A warning: the level, the kilometre, the steps."""
    L = LEVELS[level]
    head_hi = f"{L['hi']}: किमी {km} पर बाँध में ख़तरा।" if level != "khatra_tala" else f"{L['hi']}: किमी {km} पर बाँध सुरक्षित।"
    head_en = f"{L['en']}: danger at km {km} of the embankment." if level != "khatra_tala" else f"{L['en']}: km {km} of the embankment is secured."
    steps_hi = list(L["steps_hi"])
    steps_en = list(L["steps_en"])
    if level == "nikal_chalo" and camp_hi:
        steps_hi[0] = f"राहत शिविर ({camp_hi}) या ऊँची जगह जाएँ, सबसे कमज़ोर पहले"
        steps_en[0] = f"Go to the relief camp ({camp_en}) or high ground, the most vulnerable first"
    hi = head_hi + "\n" + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps_hi))
    en = head_en + "\n" + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps_en))
    return hi, en
