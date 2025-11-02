import re

# enkla lexikon → målton (matchar TONE_CANON)
RULES = [
    (r"(förlåt|my bad|ursäkt|jag tar ansvar)", "ödmjuk reparativ"),
    (r"(fattar inte|kan du förklara|hänger inte med|förtydlig)", "nyfiken klarifierande"),
    (r"(kort i tonen|på väg mellan möten|on the go|stressad)", "självinsikt struktur"),
    (r"(passiv(t)?-?agg|passivt aggressiv|sa saker jag inte menade)", "ansvarsfull utvecklingsfokus"),
    (r"(kände mig osedd|lugn(i kroppen)?|trygg(t)?|saknar mer)", "sårbar varm"),
    (r"(wall of text|hålla mig kortare|kärnbudskap|fokusera)", "lugn fokuserad"),
    (r"(vi|team|en sak i taget|jag-budskap|samarbeta)", "samarbetsinriktad"),
    (r"(backup-signal|praktisk|lösa det|dubbelpass)", "ansvarsfull praktisk"),
    (r"(fem (min|minuter)|bara vi två|\bhjärt(-| )?emoji|❤️)", "sårbar direkt"),
    (r"(gillar när du|hjälper mig|uppskattar)", "uppskattande förstärkning"),
    (r"(hur kan jag göra bättre|ping mig|vi som team)", "teamorienterad reparativ"),
    (r"(paus|time[- ]?out|20 min)", "självreglerande"),
    (r"(känns som att jag jagar|utan skuld|för oss båda)", "uppriktig icke anklagande"),
    (r"(sätt[a]? gräns|check-signal|respektfull)", "gränssättande respektfull"),
    (r"(space|egen tid|återhämtning|IRL-check)", "självinsikt gräns"),
    (r"(roller|byta spår|paus när det händer)", "mönsterfokus lösningsorienterad"),
    (r"(valfrihet|eller vill du|ägarskap)", "empati valfrihet"),
    (r"(ramar|agenda|max 30|minut(er)?|nästa steg)", "ramverk neutral"),
    (r"(vill du höra hur det landade|bättre väg)", "sårbar inbjudande"),
    (r"(bråk i text|byt kanal|IRL/Call)", "deeskalerande praktisk"),
    (r"(spegla|innan vi går vidare|missförstådd)", "metakommunikation"),
    (r"(humor.*aj|signal.*byta spår|liten signal)", "lätt tydlig"),
    (r"(jag försöker reglera|inte straffa dig|plan för sådana lägen)", "transparent självreglering"),
    (r"(börja litet|micro-steg|små steg)", "gradvis exponering"),
]


def analyze(text: str, lang: str = "sv", persona=None, context=None) -> dict:
    t = text or ""
    hits = []
    for rx, label in RULES:
        if re.search(rx, t, flags=re.I):
            hits.append(label)
    tone_text = hits[0] if hits else "lugn fokuserad"
    labels = list(dict.fromkeys(hits or [tone_text]))
    scores = {lbl: (1.0 if lbl == tone_text else 0.6) for lbl in labels}
    return {"tone_text": tone_text, "labels": labels, "scores": scores}


