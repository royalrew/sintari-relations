import re

BASE = {
    "ödmjuk reparativ": ["Ta ansvar utan bortförklaring","Öppen fråga","Boka tid"],
    "nyfiken klarifierande": ["Be om förtydligande","Spegla med egna ord","Svarsrutin"],
    "självinsikt struktur": ["Validera känsla","Boka tid","Jag-budskap"],
    "ansvarsfull utvecklingsfokus": ["Namnge mönster","Check signal","Jag-budskap"],
    "sårbar varm": ["Uttryck behov tydligt","Ge konkret exempel","Be om frivilligt ja"],
    "lugn fokuserad": ["Prioritera kärnbudskap","Öppen fråga","Spegla"],
    "samarbetsinriktad": ["Jag-budskap","Svarsrutin","Boka tid"],
    "ansvarsfull praktisk": ["Svarsrutin","Check signal","Boka tid"],
    "sårbar direkt": ["Säg känsla utan skuld","Boka tid","Öppen fråga"],
    "uppskattande förstärkning": ["Ge specifik förstärkning","Uppmuntra önskat beteende","Be om fortsättning"],
    "teamorienterad reparativ": ["Ägarskap för ton","Ställ öppen förbättringsfråga","Kom överens om signal"],
    "självreglerande": ["Föreslå time-out-regel","Sätt timebox","Bekräfta intention att återkomma"],
    "uppriktig icke anklagande": ["Beskriv mönster utan skuld","Svarsrutin","Delat beslut"],
    "gränssättande respektfull": ["Sätt gräns","Check signal","Validera känsla"],
    "självinsikt gräns": ["Sätt gräns","Boka tid","Byt kanal"],
    "mönsterfokus lösningsorienterad": ["Identifiera rollmönster","Paus regel","Delat beslut"],
    "empati valfrihet": ["Validera känsla","Delat beslut","Svarsrutin"],
    "ramverk neutral": ["Sätt agenda","Timebox","Delat beslut"],
    "sårbar inbjudande": ["Jag-budskap","Öppen fråga","Spegla"],
    "deeskalerande praktisk": ["Byt kanal","Sätt agenda","Boka tid"],
    "metakommunikation": ["Spegla","Jag-budskap","Delat beslut"],
    "lätt tydlig": ["Check signal","Reparera utan skuld","Delat beslut"],
    "transparent självreglering": ["Avdramatisera undandragande","Plan för pauser","Gemensam trygghetsfras"],
    "gradvis exponering": ["Identifiera låg-risk del","Sätt delmål","Fira små framsteg"],
}

BOOST_CONFLICT = {
    "passivt aggressiv": ["Namnge mönster","Paus regel","Spegla"],
    "defensiv": ["Spegla","Jag-budskap","Öppen fråga"],
    "ifrågasatt": ["Jag-budskap","Validera känsla","Check signal"],
}
BOOST_BOUNDARY = ["Sätt gräns","Formulera regeln tydligt","Bekräfta frivillighet"]


def recommend(text: str, lang: str = "sv", insights: dict | None = None, persona=None, context=None) -> dict:
    tone = None
    t = (text or "").lower()
    if re.search(r"förlåt|ursäkt|my bad", t):
        tone = "ödmjuk reparativ"
    if re.search(r"förklara|hänger inte med|förtydlig", t):
        tone = tone or "nyfiken klarifierande"
    tone = tone or "lugn fokuserad"
    steps = BASE.get(tone, BASE["lugn fokuserad"])[:]

    if insights:
        cf = (insights.get("conflict") or {})
        bd = (insights.get("boundary") or {})
        for trig_rx in cf.get("triggers", []):
            for key, extra in BOOST_CONFLICT.items():
                if key in trig_rx:
                    for s in extra:
                        if s not in steps:
                            steps.append(s)
        if bd.get("has_boundary"):
            for s in BOOST_BOUNDARY:
                if s not in steps:
                    steps.append(s)

    return {"steps": steps[:5]}


