"""
Longing Branch Tests - Python
Säkerställer att "Vad vill du börja med?" ALDRIG läcker in i längtan/närhet-grenen.
"""

import pytest
import sys
from pathlib import Path

# Lägg till flows-mappen i path
repo_root = Path(__file__).parent.parent.parent
flows_path = repo_root / "flows"
sys.path.insert(0, str(flows_path))

try:
    from longing_branch_handler import LongingBranchFlow, route_to_longing_branch
except ImportError:
    # Fallback: försök från sintari-relations/flows
    sys.path.insert(0, str(repo_root / "sintari-relations" / "flows"))
    from longing_branch_handler import LongingBranchFlow, route_to_longing_branch


class TestLongingBranchNoReset:
    """Test att längtan-grenen aldrig ger reset-fraser."""
    
    def test_longing_no_reset_sequence(self):
        """Test att en sekvens av längtan-input aldrig ger reset-fraser."""
        flow = LongingBranchFlow()
        session_id = "test-session-1"
        
        forbidden_phrases = [
            "vad vill du börja med",
            "det känns oklart nu",
            "mini-steg",
            "vad händer oftast precis innan",
        ]
        
        # Test-sekvens från användarens exempel
        sequence = [
            "Jag önskar att någon höll om mig",
            "nära",
            "specifik",
            "önskar"
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
    
    def test_longing_tyst_tom_tung_chain(self):
        """Test att emotionell kedja aldrig ger reset-fraser."""
        flow = LongingBranchFlow()
        session_id = "test-session-2"
        
        forbidden_phrases = [
            "vad vill du börja med",
            "det känns oklart nu",
            "mini-steg",
        ]
        
        # Emotionell kedja
        sequence = [
            "ledsenhet",
            "tyst",
            "tom",
            "tung",
            "bli buren",
            "mellan",
            "en känsla",
            "väntar"
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
                
                current_step = next_step


class TestLongingBranchIntentDetection:
    """Test intent-detektion för längtan-grenen."""
    
    def test_route_to_longing_branch_önskar(self):
        """Test att 'önskar' routas till längtan-grenen."""
        assert route_to_longing_branch("Jag önskar att någon håller om mig")
        assert route_to_longing_branch("önskar")
        assert route_to_longing_branch("jag önskar")
    
    def test_route_to_longing_branch_saknar(self):
        """Test att 'saknar' routas till längtan-grenen."""
        assert route_to_longing_branch("Jag saknar någon")
        assert route_to_longing_branch("saknar")
    
    def test_route_to_longing_branch_nära(self):
        """Test att 'nära' routas till längtan-grenen."""
        assert route_to_longing_branch("Jag vill vara nära")
        assert route_to_longing_branch("nära")
    
    def test_route_to_longing_branch_bli_hållen(self):
        """Test att 'bli hållen' routas till längtan-grenen."""
        assert route_to_longing_branch("Jag vill bli hållen")
        assert route_to_longing_branch("höll om mig")
        assert route_to_longing_branch("håller om mig")
    
    def test_route_to_longing_branch_not_longing(self):
        """Test att icke-längtan-input inte routas."""
        assert not route_to_longing_branch("Jag är sur")
        assert not route_to_longing_branch("Hej")
        assert not route_to_longing_branch("Vad vill du börja med?")


class TestLongingBranchFlow:
    """Test LongingBranchFlow-klassen."""
    
    def test_get_response_önskar(self):
        """Test att get_response ger korrekt respons för 'önskar'."""
        flow = LongingBranchFlow()
        response, next_step, next_type, metadata = flow.get_response(
            "Jag önskar att någon håller om mig",
            session_id="test-session-3"
        )
        
        assert response is not None
        assert next_step is not None
        assert "kroppen" in response.lower() or "känns" in response.lower()
    
    def test_get_response_saknar(self):
        """Test att get_response ger korrekt respons för 'saknar'."""
        flow = LongingBranchFlow()
        response, next_step, next_type, metadata = flow.get_response(
            "Jag saknar någon",
            session_id="test-session-4"
        )
        
        assert response is not None
        assert next_step is not None
        assert "kroppen" in response.lower() or "känns" in response.lower()
    
    def test_session_state_persistence(self):
        """Test att session state sparas korrekt."""
        flow = LongingBranchFlow()
        session_id = "test-session-5"
        
        # Första steget
        response1, next_step1, next_type1, metadata1 = flow.get_response(
            "Jag önskar att någon håller om mig",
            session_id=session_id
        )
        
        # Kontrollera att state sparas
        state = flow.get_session_state(session_id)
        assert state["node"] == next_step1
        assert state["branch"] == "longing"
        
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

