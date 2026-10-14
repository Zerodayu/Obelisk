"""Mocked safety regressions for the separate opt-in Redis PING mode."""
from contextlib import redirect_stdout
import io
import json
import os
import subprocess
import unittest
from unittest.mock import MagicMock, patch

from testing_modules.old_test import _redis_ping as ping, run_all


class TestRedisPingSafety(unittest.TestCase):
    def metadata(self):
        return {
            "running": True,
            "ports": {"6379/tcp": [{"HostIp": "127.0.0.1", "HostPort": "6379"}]},
            "labels": {
                "com.docker.compose.service": "redis",
                "com.docker.compose.project.working_dir": str(ping.REPOSITORY_ROOT),
                "com.docker.compose.project.config_files": str(ping.COMPOSE_FILE),
            },
        }

    def check(self, metadata=None, endpoint="npipe:////./pipe/dockerDesktopLinuxEngine",
              reply=b"+PONG\r\n", receive_error=None):
        metadata = self.metadata() if metadata is None else metadata
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.side_effect = receive_error or [reply]
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(ping, "_docker", side_effect=["desktop-linux", json.dumps(endpoint), json.dumps(metadata)]) as docker, \
             patch.object(ping.socket, "socket", return_value=connection) as socket_factory, \
             redirect_stdout(io.StringIO()) as output:
            status = ping.check_local_redis()
        return status, output.getvalue(), docker, socket_factory, connection

    def test_ping_is_only_wire_command_and_socket_is_closed(self):
        status, output, docker, factory, connection = self.check()
        self.assertEqual(status, 0)
        self.assertIn("REDIS LIVE: PASS", output)
        self.assertIn("offline tests NOT RUN", output)
        self.assertEqual(docker.call_count, 3)
        factory.assert_called_once_with(ping.socket.AF_INET, ping.socket.SOCK_STREAM)
        connection.connect.assert_called_once_with(("127.0.0.1", 6379))
        connection.sendall.assert_called_once_with(b"*1\r\n$4\r\nPING\r\n")
        self.assertEqual(connection.settimeout.call_args_list[0].args, (1.0,))
        connection.__exit__.assert_called_once()

    def test_remote_engine_is_blocked_before_container_inspection_or_socket(self):
        for endpoint in ("ssh://production.example", "tcp://127.0.0.1:2375", "npipe:////remote/pipe/docker"):
            with self.subTest(endpoint=endpoint):
                status, _, docker, factory, _ = self.check(endpoint=endpoint)
                self.assertEqual(status, 2)
                self.assertEqual(docker.call_count, 2)
                factory.assert_not_called()

    def test_docker_host_override_is_blocked_without_any_inspection(self):
        with patch.dict(os.environ, {"DOCKER_HOST": "ssh://production.example"}), \
             patch.object(ping, "_docker") as docker, \
             patch.object(ping.socket, "socket") as factory, redirect_stdout(io.StringIO()):
            self.assertEqual(ping.check_local_redis(), 2)
        docker.assert_not_called()
        factory.assert_not_called()

    def test_foreign_checkout_is_blocked_before_socket(self):
        metadata = self.metadata()
        metadata["labels"]["com.docker.compose.project.working_dir"] = str(ping.REPOSITORY_ROOT / "other-checkout")
        status, _, _, factory, _ = self.check(metadata)
        self.assertEqual(status, 2)
        factory.assert_not_called()

    def test_wrong_compose_file_is_blocked_before_socket(self):
        metadata = self.metadata()
        metadata["labels"]["com.docker.compose.project.config_files"] = str(ping.REPOSITORY_ROOT / "production.yml")
        status, _, _, factory, _ = self.check(metadata)
        self.assertEqual(status, 2)
        factory.assert_not_called()

    def test_wrong_service_or_stopped_container_is_blocked(self):
        for change in ("service", "running"):
            metadata = self.metadata()
            if change == "service":
                metadata["labels"]["com.docker.compose.service"] = "other-redis"
            else:
                metadata["running"] = False
            with self.subTest(change=change):
                status, _, _, factory, _ = self.check(metadata)
                self.assertEqual(status, 2)
                factory.assert_not_called()

    def test_public_or_different_port_binding_is_blocked(self):
        for host, port in (("0.0.0.0", "6379"), ("192.0.2.1", "6379"), ("127.0.0.1", "6380")):
            metadata = self.metadata()
            metadata["ports"]["6379/tcp"] = [{"HostIp": host, "HostPort": port}]
            with self.subTest(host=host, port=port):
                status, _, _, factory, _ = self.check(metadata)
                self.assertEqual(status, 2)
                factory.assert_not_called()

    def test_non_pong_reply_fails_without_another_command(self):
        status, output, _, _, connection = self.check(reply=b"-NOAUTH Authentication required\r\n")
        self.assertEqual(status, 1)
        self.assertIn("REDIS LIVE: FAIL", output)
        connection.sendall.assert_called_once_with(b"*1\r\n$4\r\nPING\r\n")

    def test_receive_timeout_fails_and_closes_connection(self):
        status, _, _, _, connection = self.check(receive_error=TimeoutError())
        self.assertEqual(status, 1)
        connection.__exit__.assert_called_once()

    def test_docker_timeout_is_blocked(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(ping.shutil, "which", return_value="docker"), \
             patch.object(ping.subprocess, "run", side_effect=subprocess.TimeoutExpired("docker", 3)) as execute, \
             patch.object(ping.socket, "socket") as factory, redirect_stdout(io.StringIO()):
            self.assertEqual(ping.check_local_redis(), 2)
        self.assertEqual(execute.call_args.kwargs["timeout"], 3.0)
        factory.assert_not_called()

    def test_live_mode_bypasses_offline_context_and_propagates_status(self):
        with patch.object(ping, "check_local_redis", return_value=2) as check, \
             patch.object(run_all, "offline_context") as offline, redirect_stdout(io.StringIO()):
            self.assertEqual(run_all.main(["--redis-live"]), 2)
        check.assert_called_once_with()
        offline.assert_not_called()

    def test_live_mode_cannot_be_combined_with_suite_or_list(self):
        for arguments in (["--redis-live", "--suite", "offline"], ["--redis-live", "--list"]):
            with self.subTest(arguments=arguments), patch.object(ping, "check_local_redis") as check, \
                 patch("sys.stderr", new=io.StringIO()), self.assertRaises(SystemExit) as result:
                run_all.main(arguments)
            self.assertEqual(result.exception.code, 2)
            check.assert_not_called()
