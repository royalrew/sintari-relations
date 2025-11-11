"""
Anger Branch Flow Handler
Läser anger_branch.csv och matchar användarinput mot trädstrukturen för ILSKA-grenen.

Detta är regler, inte exempel - coachen ska ALDRIG repetera "Vad vill du börja med?" i denna gren.
"""
import csv
import re
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from datetime import datetime

# Hitta CSV-filen relativt till denna fil
CSV_PATH = Path(__file__).parent / "anger_branch.csv"

# Session state storage (i produktion, använd Redis eller databas)
_session_state: Dict[str, Dict[str, any]] = {}


class AngerBranchFlow:
    """Hanterar ilska-grenen baserat på CSV-trädstruktur."""
    
    def __init__(self, csv_path: Optional[Path] = None):
        self.csv_path = csv_path or CSV_PATH
        self.steps: List[Dict[str, str]] = []
        self.current_step_id: Optional[str] = None
        self.load_csv()
    
    def get_session_state(self, session_id: str) -> Dict[str, any]:
        """Hämta session state för given session_id."""
        return _session_state.get(session_id, {
            "node": None,
            "last_trigger": None,
            "started_at": None,
            "branch": "anger"
        })
    
    def set_session_state(self, session_id: str, node: str, last_trigger: str) -> None:
        """Spara session state."""
        state = self.get_session_state(session_id)
        if state["started_at"] is None:
            state["started_at"] = datetime.now().isoformat()
        state["node"] = node
        state["last_trigger"] = last_trigger
        state["branch"] = "anger"
        _session_state[session_id] = state
    
    def load_csv(self) -> None:
        """Ladda CSV-filen med trädstrukturen."""
        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV-fil hittades inte: {self.csv_path}")
        
        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.steps = list(reader)
    
    def match_pattern(self, pattern: str, text: str) -> bool:
        """
        Matcha input_pattern mot text.
        Stödjer wildcards och pipe-separerade alternativ: *sur*|*irriterad* matchar både "jag är sur" och "irriterad"
        """
        # Dela upp pipe-separerade alternativ
        alternatives = pattern.split('|')
        
        for alt in alternatives:
            alt = alt.strip()
            # Konvertera wildcard-pattern till regex
            regex_pattern = alt.replace('*', '.*')
            regex_pattern = f"^{regex_pattern}$"
            
            try:
                if re.search(regex_pattern, text, re.IGNORECASE):
                    return True
            except re.error:
                # Fallback: enkel substring-match om regex failar
                if alt.lower().replace('*', '') in text.lower():
                    return True
        
        return False
    
    def find_matching_step(
        self, 
        user_input: str, 
        current_step_id: Optional[str] = None
    ) -> Optional[Dict[str, str]]:
        """
        Hitta matchande steg baserat på user_input och current_step_id.
        
        Args:
            user_input: Användarens input
            current_step_id: Nuvarande steg-ID (t.ex. "A2") eller None för första steget
        
        Returns:
            Matchande steg-dict eller None om ingen match hittades
        """
        # Om vi har current_step_id, försök först matcha mot steg i samma nivå
        if current_step_id:
            candidate_steps = [s for s in self.steps if s['step_id'] == current_step_id]
            for step in candidate_steps:
                pattern = step['input_pattern']
                if self.match_pattern(pattern, user_input):
                    return step
        
        # Om ingen match i samma nivå, sök i alla steg (inklusive nästa nivå)
        # Detta tillåter övergångar mellan nivåer (t.ex. A1 -> A2)
        for step in self.steps:
            pattern = step['input_pattern']
            if self.match_pattern(pattern, user_input):
                return step
        
        return None
    
    def matches(self, user_input: str) -> bool:
        """
        Kontrollera om user_input matchar ilska-grenen.
        Används för intent routing.
        """
        return self.is_anger_branch_input(user_input)
    
    def is_anger_branch_input(self, user_input: str) -> bool:
        """
        Kontrollera om user_input indikerar att vi ska gå in i ilska-grenen.
        Detta är för intent routing.
        Använder regex + fuzzy matching för bättre täckning.
        """
        # Regex patterns för exakt matchning
        anger_regex = [
            r'\bsur\b',
            r'\birriterad\b',
            r'\barg\b',
            r'\bfrustrerad\b',
            r'\black\b',
            r'\bprovocerad\b',
        ]
        
        user_lower = user_input.lower()
        
        # Exakt regex match
        if any(re.search(pattern, user_lower, re.IGNORECASE) for pattern in anger_regex):
            return True
        
        # Fuzzy match för vanliga stavfel (Levenshtein ≤1)
        fuzzy_patterns = ["sur", "irriterad", "arg", "frustrerad", "lack", "provocerad"]
        for pattern in fuzzy_patterns:
            if self._fuzzy_match(pattern, user_lower, max_distance=1):
                return True
        
        return False
    
    def _fuzzy_match(self, pattern: str, text: str, max_distance: int = 1) -> bool:
        """
        Enkel fuzzy match med Levenshtein distance.
        För närvarande enkel implementation - kan förbättras med python-Levenshtein.
        """
        pattern_lower = pattern.lower()
        if pattern_lower in text:
            return True
        
        # Kolla om pattern finns med 1 tecken skillnad (enkel implementation)
        for i in range(len(text) - len(pattern_lower) + 1):
            substring = text[i:i+len(pattern_lower)]
            if len(substring) == len(pattern_lower):
                diff = sum(1 for a, b in zip(substring, pattern_lower) if a != b)
                if diff <= max_distance:
                    return True
        
        return False
    
    def get_response(
        self, 
        user_input: str, 
        session_id: Optional[str] = None,
        current_step_id: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Dict[str, any]]:
        """
        Hämta coach-respons för given user_input med session state.
        
        Returns:
            (coach_response, next_step_id, next_expected_user_type, metadata) eller (None, None, None, {}) om ingen match
        """
        # Hämta session state om session_id finns
        if session_id:
            state = self.get_session_state(session_id)
            if state["node"]:
                current_step_id = state["node"]
        
        step = self.find_matching_step(user_input, current_step_id)
        
        if not step:
            # Om ingen match och vi är i ilska-grenen, erbjud låg-friktionsval
            if session_id and self.get_session_state(session_id).get("branch") == "anger":
                # Erbjud tre enkla val baserat på nuvarande steg
                if current_step_id == "A3":
                    fallback_response = "Okej. Om du känner in det nu — känns det som att en gräns passerats, något varit orättvist, eller att du blivit överväldigad?"
                    return fallback_response, "A3", "meaning_triage", {"fallback": True}
            return None, None, None, {}
        
        coach_response = step['coach_response']
        next_step_id = step['step_id']
        next_expected_type = step['next_expected_user_type']
        
        # Uppdatera session state
        if session_id:
            self.set_session_state(session_id, next_step_id, user_input)
        
        metadata = {
            "node": next_step_id,
            "expected_type": next_expected_type,
            "branch": "anger"
        }
        
        return coach_response, next_step_id, next_expected_type, metadata


def route_to_anger_branch(user_input: str) -> bool:
    """
    Intent router helper: Kontrollera om input ska routas till ilska-grenen.
    
    Usage:
        if route_to_anger_branch(user_message):
            # Route to anger branch flow
            flow = AngerBranchFlow()
            response, next_step, next_type = flow.get_response(user_message)
    """
    flow = AngerBranchFlow()
    return flow.is_anger_branch_input(user_input)


# CLI-testning
if __name__ == "__main__":
    flow = AngerBranchFlow()
    
    # Test cases
    test_inputs = [
        "jag är sur",
        "bröst",
        "brännande",
        "gräns",
    ]
    
    current_step = None
    for user_input in test_inputs:
        response, next_step, next_type = flow.get_response(user_input, current_step)
        if response:
            print(f"\nUser: {user_input}")
            print(f"Step: {next_step} → {next_type}")
            print(f"Coach: {response}")
            current_step = next_step
        else:
            print(f"\nNo match for: {user_input}")

