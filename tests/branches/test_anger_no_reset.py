"""
Anger Branch Tests - Python
Säkerställer att "Vad vill du börja med?" ALDRIG läcker in i ilska-grenen.
"""

import pytest
import sys
from pathlib import Path

# Lägg till flows-mappen i path
repo_root = Path(__file__).parent.parent.parent
flows_path = repo_root / "flows"
sys.path.insert(0, str(flows_path))

try:
    from anger_branch_handler import AngerBranchFlow, route_to_anger_branch
except ImportError:
    # Fallback: försök från sintari-relations/flows
    sys.path.insert(0, str(repo_root / "sintari-relations" / "flows"))
    from anger_branch_handler import AngerBranchFlow, route_to_anger_branch


class TestAngerBranchNoReset:
    """Test att ilska-grenen aldrig ger reset-fraser."""
    
    def test_anger_no_reset_sequence(self):
        """Test att en sekvens av ilska-input aldrig ger reset-fraser."""
        flow = AngerBranchFlow()
        session_id = "test-session-anger-1"
        
        forbidden_phrases = [
            "vad vill du börja med",
            "det känns oklart nu",
            "vill du att vi tar fram ett första mini-steg",
            "härligt! det här betyder något för dig",
        ]
        
        # Test-sekvens från användarens exempel
        sequence = [
            "jag är irriterad",
            "mage",
            "spänning",
            "orättvist",
            "sätta ord"
        ]
        
        current_step = None
        for user_input in sequence:
            response, next_step, next_type, metadata = flow.get_response(
                user_input, 
                session_id=session_id,
                current_step_id=current_step
            )
            
            if response:
                response_lower = response.lower()
                # Kontrollera att inga förbjudna fraser finns
                for forbidden in forbidden_phrases:
                    assert forbidden not in response_lower, \
                        f"Forbidden phrase '{forbidden}' found in response: {response}"
                
                current_step = next_step
    
    def test_anger_gräns_path(self):
        """Test att gräns-path fungerar korrekt."""
        flow = AngerBranchFlow()
        session_id = "test-session-anger-2"
        
        forbidden_phrases = [
            "vad vill du börja med",
            "det känns oklart nu",
        ]
        
        # Gräns-path sekvens
        sequence = [
            "jag är arg",
            "bröst",
            "brännande",
            "gräns",
        ]
        
        current_step = None
        for user_input in sequence:
            response, next_step, next_type, metadata = flow.get_response(
                user_input,
                session_id=session_id,
                current_step_id=current_step
            )
            
            if response:
                response_lower = response.lower()
                for forbidden in forbidden_phrases:
                    assert forbidden not in response_lower, \
                        f"Forbidden phrase '{forbidden}' found in response: {response}"
                
                # Sista steget bör erbjuda val mellan hållning och språk
                if user_input == "gräns":
                    assert "stanna" in response_lower or "gräns-språk" in response_lower or "utforska" in response_lower
                
                current_step = next_step


class TestAngerBranchIntentDetection:
    """Test intent-detektion för ilska-grenen."""
    
    def test_route_to_anger_branch_sur(self):
        """Test att 'sur' routas till ilska-grenen."""
        assert route_to_anger_branch("Jag är sur")
        assert route_to_anger_branch("sur")
        assert route_to_anger_branch("jag är sur")
    
    def test_route_to_anger_branch_irriterad(self):
        """Test att 'irriterad' routas till ilska-grenen."""
        assert route_to_anger_branch("Jag är irriterad")
        assert route_to_anger_branch("irriterad")
    
    def test_route_to_anger_branch_arg(self):
        """Test att 'arg' routas till ilska-grenen."""
        assert route_to_anger_branch("Jag är arg")
        assert route_to_anger_branch("arg")
    
    def test_route_to_anger_branch_frustrerad(self):
        """Test att 'frustrerad' routas till ilska-grenen."""
        assert route_to_anger_branch("Jag är frustrerad")
        assert route_to_anger_branch("frustrerad")
    
    def test_route_to_anger_branch_not_anger(self):
        """Test att icke-ilska-input inte routas."""
        assert not route_to_anger_branch("Jag är ledsen")
        assert not route_to_anger_branch("Hej")
        assert not route_to_anger_branch("Vad vill du börja med?")


class TestAngerBranchFlow:
    """Test AngerBranchFlow-klassen."""
    
    def test_get_response_sur(self):
        """Test att get_response ger korrekt respons för 'sur'."""
        flow = AngerBranchFlow()
        response, next_step, next_type, metadata = flow.get_response(
            "jag är sur",
            session_id="test-session-anger-3"
        )
        
        assert response is not None
        assert next_step is not None
        assert "kroppen" in response.lower() or "bröstet" in response.lower() or "magen" in response.lower() or "halsen" in response.lower()
    
    def test_get_response_bröst(self):
        """Test att get_response ger korrekt respons för 'bröst'."""
        flow = AngerBranchFlow()
        response, next_step, next_type, metadata = flow.get_response(
            "bröst",
            session_id="test-session-anger-4",
            current_step_id="A1"
        )
        
        assert response is not None
        assert next_step == "A2"
        assert "tryck" in response.lower() or "värme" in response.lower() or "brännande" in response.lower()
    
    def test_session_state_persistence(self):
        """Test att session state sparas korrekt."""
        flow = AngerBranchFlow()
        session_id = "test-session-anger-5"
        
        # Första steget
        response1, next_step1, next_type1, metadata1 = flow.get_response(
            "jag är sur",
            session_id=session_id
        )
        
        # Kontrollera att state sparas
        state = flow.get_session_state(session_id)
        assert state["node"] == next_step1
        assert state["branch"] == "anger"
        
        # Andra steget (använd state)
        response2, next_step2, next_type2, metadata2 = flow.get_response(
            "bröst",
            session_id=session_id
        )
        
        # Kontrollera att state uppdateras
        state2 = flow.get_session_state(session_id)
        assert state2["node"] == next_step2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

