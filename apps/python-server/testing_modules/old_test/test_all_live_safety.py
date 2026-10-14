"""No-service safety checks for opt-in legacy live orchestration."""
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from testing_modules.old_test import _all_live as live, run_all


class TestAllLiveSafety(unittest.TestCase):
    def test_live_flag_dispatch_does_not_enter_offline_context_in_parent(self):
        with patch.object(live, "run_all_live", return_value=2) as run, \
             patch.object(run_all, "offline_context") as offline:
            self.assertEqual(run_all.main(["--all-live"]), 2)
        run.assert_called_once_with()
        offline.assert_not_called()

    def test_live_flag_cannot_be_combined_with_existing_modes(self):
        for args in (["--all-live", "--redis-live"], ["--all-live", "--suite", "offline"], ["--all-live", "--list"]):
            with self.subTest(args=args), patch.object(live, "run_all_live") as run, \
                 patch("sys.stderr", new=io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    run_all.main(args)
                self.assertEqual(error.exception.code, 2)
                run.assert_not_called()

    def test_list_does_not_start_live_harness(self):
        with patch.object(live, "run_all_live") as run, patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(run_all.main(["--list"]), 0)
        run.assert_not_called()

    def test_proxy_configuration_blocks_before_docker(self):
        from testing_modules.old_test import _redis_ping
        with patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy.invalid"}), \
             patch.object(_redis_ping, "_verify_local_container") as inspect:
            with self.assertRaisesRegex(live.Blocked, "Proxy"):
                live._preflight()
        inspect.assert_not_called()

    def test_missing_dependency_blocks_before_docker(self):
        from testing_modules.old_test import _redis_ping
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(live.importlib.util, "find_spec", return_value=None), \
             patch.object(_redis_ping, "_verify_local_container") as inspect:
            with self.assertRaisesRegex(live.Blocked, "Missing dependency"):
                live._preflight()
        inspect.assert_not_called()

    def test_missing_fixture_blocks_before_docker(self):
        from testing_modules.old_test import _redis_ping
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(live, "FIXTURES", (Path(__file__).with_name("missing-fixture.xlsx"),)), \
             patch.object(live.importlib.util, "find_spec", return_value=object()), \
             patch.object(_redis_ping, "_verify_local_container") as inspect:
            with self.assertRaisesRegex(live.Blocked, "Required fixture"):
                live._preflight()
        inspect.assert_not_called()
