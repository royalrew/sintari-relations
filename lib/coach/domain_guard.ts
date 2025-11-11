/**
 * Domain Guard - Policy-guard för off-topic och reframe till relationsfokus
 */

export function isSimpleMath(q?: string): boolean {
  if (!q) return false;
  return /^\s*\d+\s*([+\-*/x])\s*\d+\s*\??\s*$/i.test(q);
}

export function solveSimpleMath(q: string): string {
  const m = q.match(/(\d+)\s*([+\-*/x])\s*(\d+)/i);
  if (!m) return "";
  const a = parseInt(m[1],10), op = m[2], b = parseInt(m[3],10);
  let r = 0;
  if (op === '+') r = a + b;
  else if (op === '-') r = a - b;
  else if (op === '*' || op.toLowerCase()==='x') r = a * b;
  else if (op === '/') r = b !== 0 ? a / b : NaN;
  return isFinite(r) ? String(r) : "Ogiltig division";
}

export function isTravelTopic(s?: string): boolean {
  if (!s) return false;
  return /(resa|åka|flyga|grekland|semester|hotell|boende|flyg|resor|turism|destination|packa|bagage|pass|visum|flygplats|resväska|kryssning|charter|backpack|backpacking|utflykt|weekend|weekendresa|städer|land|europa|asien|afrika|amerika|spanien|frankrike|italien|tyskland|norge|danmark|finland|island|portugal|nederländerna|belgien|schweiz|österrike|polen|tjeckien|ungern|rumänien|bulgarien|kroatien|serbien|slovenien|slovakien|estland|lettland|litauen|malta|cypern|irland|storbritannien|sverige)/i.test(s);
}

export function isClearlyNonRelation(s?: string, conversation?: Array<{role:'user'|'assistant'; content:string}>): boolean {
  if (!s) return false;
  const t = s.toLowerCase();
  
  // Kolla om föregående meddelanden i konversationen handlade om relationer
  // Om så är fallet, är även följdfrågor/svar INTE off-topic även om de innehåller off-topic-ord
  if (conversation && conversation.length > 0) {
    const recentMessages = conversation.slice(-3); // Kolla senaste 3 meddelandena
    const recentText = recentMessages.map(m => m.content).join(' ').toLowerCase();
    
    const relationKeywords = /\b(mot mig|med mig|tillsammans|vi|de|han|hon|dem|oss|er|relation|vän|partner|pojkvän|flickvän|sambo|make|maka|fru|man|barn|son|dotter|syskon|familj|förälder|mamma|pappa|mormor|morfar|farmor|farfar|moster|morbror|faster|farbror|kusin|släkt|kollega|chef|boss|kompis|kamrat|vänskap|fiende|konflikt|bråk|gräl|disput|meningsskiljaktighet|oense|osams|arg på|sur på|ledsen på|besviken på|glad på|stolt på|tacksam för|tackar|tack|ursäkt|förlåt|ursäkta|förlåt mig|ursäkta mig|tycker om|gillar|älskar|hatar|avskyr|ogillar|respekterar|förtroende|litar på|litar inte på|misstror|misstänker|oroar sig för|bekymrar sig för|bryr sig om|bryr sig inte om|ignorerar|ignorerar mig|lyssnar inte|lyssnar på|hör på|hör inte på|förstår|förstår inte|förstår mig|förstår mig inte|respekterar mig|respekterar mig inte|behandlar mig|behandlar mig dåligt|behandlar mig bra|behandlar mig illa|behandlar mig väl|snäll mot|snäll mot mig|elak mot|elak mot mig|taskig mot|taskig mot mig|obehaglig mot|obehaglig mot mig|trevlig mot|trevlig mot mig|vänlig mot|vänlig mot mig|ovänlig mot|ovänlig mot mig|kall mot|kall mot mig|varm mot|varm mot mig|kylig mot|kylig mot mig|kärleksfull mot|kärleksfull mot mig|okärleksfull mot|okärleksfull mot mig|stöttar|stöttar mig|stöttar mig inte|hjälper|hjälper mig|hjälper mig inte|stödjer|stödjer mig|stödjer mig inte|backar upp|backar upp mig|backar upp mig inte|tar parti|tar parti för|tar parti mot|tar parti för mig|tar parti mot mig|tar inte parti|säger emot|säger emot mig|håller med|håller med mig|håller inte med|håller inte med mig|kommunicerar|kommunicerar med|kommunicerar med mig|kommunicerar inte|kommunicerar inte med|kommunicerar inte med mig|pratar|pratar med|pratar med mig|pratar inte|pratar inte med|pratar inte med mig|samtalar|samtalar med|samtalar med mig|samtalar inte|samtalar inte med|samtalar inte med mig|diskuterar|diskuterar med|diskuterar med mig|diskuterar inte|diskuterar inte med|diskuterar inte med mig|grälar|grälar med|grälar med mig|grälar inte|grälar inte med|grälar inte med mig|bråkar|bråkar med|bråkar med mig|bråkar inte|bråkar inte med|bråkar inte med mig|konflikter|konflikter med|konflikter med mig|konflikter inte|konflikter inte med|konflikter inte med mig|osams|osams med|osams med mig|osams inte|osams inte med|osams inte med mig|oense|oense med|oense med mig|oense inte|oense inte med|oense inte med mig|disput|disput med|disput med mig|disput inte|disput inte med|disput inte med mig|gräl|gräl med|gräl med mig|gräl inte|gräl inte med|gräl inte med mig|vilka|vem|vem är|vilka är)\b/i;
    
    if (relationKeywords.test(recentText)) {
      return false; // Föregående meddelanden handlade om relationer, så detta är INTE off-topic
    }
  }
  
  // Först kolla om det faktiskt handlar om relationer i det aktuella meddelandet
  // Om det finns relationella nyckelord, är det INTE off-topic
  const relationKeywords = /\b(mot mig|med mig|tillsammans|vi|de|han|hon|dem|oss|er|relation|vän|partner|pojkvän|flickvän|sambo|make|maka|fru|man|barn|son|dotter|syskon|familj|förälder|mamma|pappa|mormor|morfar|farmor|farfar|moster|morbror|faster|farbror|kusin|släkt|kollega|chef|boss|kompis|kamrat|vänskap|fiende|konflikt|bråk|gräl|disput|meningsskiljaktighet|oense|osams|arg på|sur på|ledsen på|besviken på|glad på|stolt på|tacksam för|tackar|tack|ursäkt|förlåt|ursäkta|förlåt mig|ursäkta mig|tycker om|gillar|älskar|hatar|avskyr|ogillar|respekterar|förtroende|litar på|litar inte på|misstror|misstänker|oroar sig för|bekymrar sig för|bryr sig om|bryr sig inte om|ignorerar|ignorerar mig|lyssnar inte|lyssnar på|hör på|hör inte på|förstår|förstår inte|förstår mig|förstår mig inte|respekterar mig|respekterar mig inte|behandlar mig|behandlar mig dåligt|behandlar mig bra|behandlar mig illa|behandlar mig väl|snäll mot|snäll mot mig|elak mot|elak mot mig|taskig mot|taskig mot mig|obehaglig mot|obehaglig mot mig|trevlig mot|trevlig mot mig|vänlig mot|vänlig mot mig|ovänlig mot|ovänlig mot mig|kall mot|kall mot mig|varm mot|varm mot mig|kylig mot|kylig mot mig|kärleksfull mot|kärleksfull mot mig|okärleksfull mot|okärleksfull mot mig|stöttar|stöttar mig|stöttar mig inte|hjälper|hjälper mig|hjälper mig inte|stödjer|stödjer mig|stödjer mig inte|backar upp|backar upp mig|backar upp mig inte|tar parti|tar parti för|tar parti mot|tar parti för mig|tar parti mot mig|tar inte parti|säger emot|säger emot mig|håller med|håller med mig|håller inte med|håller inte med mig|kommunicerar|kommunicerar med|kommunicerar med mig|kommunicerar inte|kommunicerar inte med|kommunicerar inte med mig|pratar|pratar med|pratar med mig|pratar inte|pratar inte med|pratar inte med mig|samtalar|samtalar med|samtalar med mig|samtalar inte|samtalar inte med|samtalar inte med mig|diskuterar|diskuterar med|diskuterar med mig|diskuterar inte|diskuterar inte med|diskuterar inte med mig|grälar|grälar med|grälar med mig|grälar inte|grälar inte med|grälar inte med mig|bråkar|bråkar med|bråkar med mig|bråkar inte|bråkar inte med|bråkar inte med mig|konflikter|konflikter med|konflikter med mig|konflikter inte|konflikter inte med|konflikter inte med mig|osams|osams med|osams med mig|osams inte|osams inte med|osams inte med mig|oense|oense med|oense med mig|oense inte|oense inte med|oense inte med mig|disput|disput med|disput med mig|disput inte|disput inte med|disput inte med mig|gräl|gräl med|gräl med mig|gräl inte|gräl inte med|gräl inte med mig)\b/i;
  
  if (relationKeywords.test(t)) {
    return false; // Det handlar om relationer, så det är INTE off-topic
  }
  
  // Om det inte handlar om relationer, kolla om det är off-topic
  return isSimpleMath(t) || 
    /\b(väder|aktiekurs|kod|cpu|fotboll|recept|matlagning|programmering|python|javascript|html|css|react|node|git|github|docker|kubernetes|aws|azure|cloud|server|databas|sql|nosql|mongodb|postgres|mysql|redis|kafka|rabbitmq|elasticsearch|grafana|prometheus|monitoring|devops|ci\/cd|pipeline|deploy|production|staging|testing|unit test|integration test|e2e|tdd|bdd|agile|scrum|kanban|jira|confluence|slack|teams|zoom|meet|webex|skype|discord|telegram|whatsapp|signal|messenger|instagram|facebook|twitter|x|linkedin|tiktok|youtube|netflix|spotify|apple music|amazon|prime|disney|hbo|hulu|plex|kodi|torrent|pirate|download|upload|streaming|gaming|playstation|xbox|nintendo|steam|epic games|minecraft|fortnite|league of legends|world of warcraft|call of duty|fifa|nba|nhl|nfl|mlb|esport|twitch|youtube gaming|streamer|youtuber|influencer|podcast|blog|vlog|website|domain|hosting|ssl|certificate|dns|ip|ipv4|ipv6|vpn|proxy|firewall|security|encryption|decryption|hash|sha256|md5|jwt|oauth|api|rest|graphql|grpc|websocket|http|https|tcp|udp|dns|ftp|sftp|ssh|telnet|port|socket|endpoint|request|response|status code|200|404|500|error|exception|bug|debug|log|logger|console|print|printf|echo|var_dump|console\.log|debugger|breakpoint|stack trace|backtrace|memory leak|performance|optimization|refactoring|code review|pull request|merge|branch|commit|push|pull|clone|fork|repository|repo|version control|svn|cvs|mercurial|perforce|bitbucket|gitlab|github actions|gitlab ci|jenkins|travis|circleci|github pages|netlify|vercel|heroku|digitalocean|linode|vultr|hetzner|ovh|contabo|scaleway|aws lightsail|google cloud|azure|oracle cloud|ibm cloud|alibaba cloud|tencent cloud|huawei cloud|baidu cloud|yandex cloud|naver cloud|kakao cloud|line cloud|rakuten cloud|softbank cloud|ntt cloud|fujitsu cloud|nec cloud|hitachi cloud|toshiba cloud|panasonic cloud|sharp cloud|sony cloud|samsung cloud|lg cloud|hyundai cloud|skt cloud|kt cloud|lguplus cloud|kddi cloud|docomo cloud|au cloud|softbank cloud|rakuten mobile|line mobile|uq mobile|ymobile|ahamo|povo|linemo|povo|ahamo|linemo|ymobile|uq mobile|line mobile|rakuten mobile|softbank mobile|docomo mobile|au mobile|kddi mobile|skt mobile|kt mobile|lguplus mobile|hyundai mobile|lg mobile|samsung mobile|sony mobile|panasonic mobile|sharp mobile|toshiba mobile|hitachi mobile|nec mobile|fujitsu mobile|ntt mobile|rakuten mobile|line mobile|uq mobile|ymobile|ahamo|povo|linemo)\b/i.test(t);
}

export function relationReframe(s?: string): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (isTravelTopic(t)) {
    return `Ska vi göra detta relationsrelevant: vem åker du med, vad vill ni känna under resan och hur vill ni fördela beslut (budget/val)?`;
  }
  if (/pengar|budget|ekonomi|spara|investera|lån|hypotek|ränta|sparkonto|aktier|fonder|pension|försäkring|bank|swish|kort|kreditkort|debetkort|paypal|klarna|stripe|square|venmo|cashapp|zelle|apple pay|google pay|samsung pay/i.test(t)) {
    return `Vill du att vi gör en kort "pengasamtal-ram" för er två (mål, ramar, beslut, check-in)?`;
  }
  if (/jobb|chef|kollega|team|arbete|karriär|förfremjning|lön|bonus|utvärdering|prestationssamtal|utvecklingssamtal|360|feedback|peer review|mentor|mentorskap|coach|coaching|ledarskap|management|manager|director|vp|svp|evp|ceo|cto|cfo|coo|cmo|cho|cpo|cso|ciso|chro|chief|executive|president|chairman|board|styrelse|bolagsstämma|årsstämma|koncern|koncernredovisning|konsolidering|segment|division|business unit|profit center|cost center|project|program|portfolio|pmo|agile|scrum|kanban|sprint|backlog|user story|epic|feature|bug|task|subtask|story point|velocity|burndown|burnup/i.test(t)) {
    return `Vill du att vi mappar relationen (förväntningar, gränser, kommunikation) och tar fram ett första steg till bättre samarbete?`;
  }
  return null;
}

