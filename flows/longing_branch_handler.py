"""
Longing Branch Flow Handler
Läser longing_branch.csv och matchar användarinput mot trädstrukturen för LÄNGTAN/NÄRHET-grenen.

Detta är regler, inte exempel - coachen ska ALDRIG repetera "Vad vill du börja med?" i denna gren.
"""
import csv
import re
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from datetime import datetime

# Hitta CSV-filen relativt till denna fil
CSV_PATH = Path(__file__).parent / "longing_branch.csv"

# Session state storage (i produktion, använd Redis eller databas)
_session_state: Dict[str, Dict[str, any]] = {}


class LongingBranchFlow:
    """Hanterar längtan/närhet-grenen baserat på CSV-trädstruktur."""
    
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
            "branch": "longing"
        })
    
    def set_session_state(self, session_id: str, node: str, last_trigger: str) -> None:
        """Spara session state."""
        state = self.get_session_state(session_id)
        if state["started_at"] is None:
            state["started_at"] = datetime.now().isoformat()
        state["node"] = node
        state["last_trigger"] = last_trigger
        state["branch"] = "longing"
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
        Stödjer wildcards: *önskar* matchar "jag önskar", "önskar något", etc.
        """
        # Konvertera wildcard-pattern till regex
        regex_pattern = pattern.replace('*', '.*')
        regex_pattern = f"^{regex_pattern}$"
        
        try:
            return bool(re.search(regex_pattern, text, re.IGNORECASE))
        except re.error:
            # Fallback: enkel substring-match om regex failar
            return pattern.lower().replace('*', '') in text.lower()
    
    def find_matching_step(
        self, 
        user_input: str, 
        current_step_id: Optional[str] = None
    ) -> Optional[Dict[str, str]]:
        """
        Hitta matchande steg baserat på user_input och current_step_id.
        
        Args:
            user_input: Användarens input
            current_step_id: Nuvarande steg-ID (t.ex. "L2") eller None för första steget
        
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
        # Detta tillåter övergångar mellan nivåer (t.ex. L1 -> L2)
        for step in self.steps:
            pattern = step['input_pattern']
            if self.match_pattern(pattern, user_input):
                return step
        
        return None
    
    def get_response(
        self, 
        user_input: str, 
        current_step_id: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Hämta coach-respons för given user_input.
        
        Returns:
            (coach_response, next_step_id, next_expected_user_type) eller (None, None, None) om ingen match
        """
        step = self.find_matching_step(user_input, current_step_id)
        
        if not step:
            return None, None, None
        
        coach_response = step['coach_response']
        next_step_id = step['step_id']
        next_expected_type = step['next_expected_user_type']
        
        return coach_response, next_step_id, next_expected_type
    
    def matches(self, user_input: str) -> bool:
        """
        Kontrollera om user_input matchar längtan/närhet-grenen.
        Används för intent routing.
        """
        return self.is_longing_branch_input(user_input)
    
    def is_longing_branch_input(self, user_input: str) -> bool:
        """
        Kontrollera om user_input indikerar att vi ska gå in i längtan/närhet-grenen.
        Detta är för intent routing.
        Använder regex + fuzzy matching för bättre täckning.
        """
        # Regex patterns för exakt matchning
        longing_regex = [
            r'\bönskar\b',
            r'\bsaknar\b',
            r'\bvill ha närhet\b',
            r'\bbli hörd\b',
            r'\bbli hållen\b',
            r'\bvill bli hållen\b',
            r'\bvill vara nära\b',
            r'\blängtar\b',
            r'höll\s+om\s+mig',
            r'håller\s+om\s+mig',
            r'hålla\s+om\s+mig',
            r'\bnära\b',
            r'någon som håller',
            r'någon som håller om mig',
        ]
        
        user_lower = user_input.lower()
        
        # Exakt regex match
        if any(re.search(pattern, user_lower, re.IGNORECASE) for pattern in longing_regex):
            return True
        
        # Fuzzy match för vanliga stavfel (Levenshtein ≤1)
        fuzzy_patterns = ["önskar", "saknar", "höll", "håller", "nära"]
        for pattern in fuzzy_patterns:
            if self._fuzzy_match(pattern, user_lower, max_distance=1):
                return True
        
        return False
    
    def _fuzzy_match(self, pattern: str, text: str, max_distance: int = 1) -> bool:
        """
        Enkel fuzzy match med Levenshtein distance.
        För närvarande enkel implementation - kan förbättras med python-Levenshtein.
        """
        # Enkel implementation: kolla om pattern finns i text med max_distance tecken skillnad
        # För nu: kolla substring match med små variationer
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
            # Om ingen match och vi är i längtan-grenen, erbjud låg-friktionsval
            if session_id and self.get_session_state(session_id).get("branch") == "longing":
                # Erbjud tre enkla val baserat på nuvarande steg
                if current_step_id == "L3":
                    fallback_response = "Okej. Om du känner in det nu — känns det mer mjukt, hårt, tomt eller tungt?"
                    return fallback_response, "L3", "sensation_quality", {"fallback": True}
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
            "branch": "longing"
        }
        
        return coach_response, next_step_id, next_expected_type, metadata


def route_to_longing_branch(user_input: str) -> bool:
    """
    Intent router helper: Kontrollera om input ska routas till längtan/närhet-grenen.
    
    Usage:
        if route_to_longing_branch(user_message):
            # Route to longing branch flow
            flow = LongingBranchFlow()
            response, next_step, next_type = flow.get_response(user_message)
    """
    flow = LongingBranchFlow()
    return flow.is_longing_branch_input(user_input)


# CLI-testning
if __name__ == "__main__":
    flow = LongingBranchFlow()
    
    # Test cases
    test_inputs = [
        "jag önskar att någon höll om mig",
        "jag saknar någon",
        "bröst",
        "mjuk",
        "ja",
        "min mamma",
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

