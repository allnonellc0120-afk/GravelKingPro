import asyncio
import importlib
import json
import os
import sys
import types
import unittest


# Keep this unit test runnable in a bare Python environment. The Cloud Run
# image installs real httpx from requirements.txt; these protocol-compatible
# stubs let us test classification without making provider calls.
httpx_stub = types.ModuleType("httpx")


class TimeoutException(Exception):
    pass


class RequestError(Exception):
    pass


class Timeout:
    def __init__(self, **_kwargs):
        pass


httpx_stub.TimeoutException = TimeoutException
httpx_stub.RequestError = RequestError
httpx_stub.Timeout = Timeout
httpx_stub.AsyncClient = object
sys.modules.setdefault("httpx", httpx_stub)

sys.path.insert(0, os.path.dirname(__file__))
acrcloud = importlib.import_module("acrcloud")


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeClient:
    response = FakeResponse(200, {"status": {"code": 1001}})
    error = None

    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, *_args, **_kwargs):
        if self.error:
            raise self.error
        return self.response


class ACRCloudTests(unittest.TestCase):
    def setUp(self):
        os.environ["ACRCLOUD_HOST"] = "identify-us-west-2.acrcloud.com"
        os.environ["ACRCLOUD_ACCESS_KEY"] = "test-access-key"
        os.environ["ACRCLOUD_ACCESS_SECRET"] = "test-access-secret"
        acrcloud.httpx.AsyncClient = FakeClient
        FakeClient.error = None

    def identify(self):
        return asyncio.run(acrcloud.identify_audio(b"wave-bytes"))

    def test_no_match(self):
        FakeClient.response = FakeResponse(200, {"status": {"code": 1001}})
        self.assertEqual(self.identify()["status"], "no_match")

    def test_signature_matches_official_string_to_sign_contract(self):
        signature = acrcloud.build_signature(
            "test-access-secret",
            "test-access-key",
            "1700000000",
        )
        self.assertEqual(signature, "Mg53J3jzxfq7QUv54h6/9j8aZ20=")

    def test_music_match_is_normalized(self):
        FakeClient.response = FakeResponse(
            200,
            {
                "status": {"code": 0},
                "metadata": {
                    "music": [
                        {
                            "title": "Known Song",
                            "artists": [{"name": "Known Artist"}],
                            "album": {"name": "Known Album"},
                            "external_ids": {"isrc": "USABC1234567"},
                            "score": 99,
                            "acrid": "acr-123",
                        }
                    ]
                },
            },
        )
        result = self.identify()
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["matches"][0]["isrc"], "USABC1234567")

    def test_http_401_and_402_are_unavailable(self):
        for status in (401, 402):
            with self.subTest(status=status):
                FakeClient.response = FakeResponse(status, {})
                with self.assertRaises(acrcloud.ACRCloudUnavailable) as caught:
                    self.identify()
                self.assertEqual(caught.exception.category, "auth_or_billing")

    def test_rate_limit_and_server_errors_are_unavailable(self):
        for status in (429, 500, 503):
            with self.subTest(status=status):
                FakeClient.response = FakeResponse(status, {})
                with self.assertRaises(acrcloud.ACRCloudUnavailable) as caught:
                    self.identify()
                self.assertEqual(caught.exception.category, "provider_http")

    def test_timeout_is_unavailable(self):
        FakeClient.error = TimeoutException("timed out")
        with self.assertRaises(acrcloud.ACRCloudUnavailable) as caught:
            self.identify()
        self.assertEqual(caught.exception.category, "timeout")

    def test_provider_status_error_is_unavailable(self):
        FakeClient.response = FakeResponse(200, {"status": {"code": 3001}})
        with self.assertRaises(acrcloud.ACRCloudUnavailable) as caught:
            self.identify()
        self.assertEqual(caught.exception.category, "provider_status")

    def test_invalid_json_is_unavailable(self):
        FakeClient.response = FakeResponse(200, ValueError("not json"))
        with self.assertRaises(acrcloud.ACRCloudUnavailable) as caught:
            self.identify()
        self.assertEqual(caught.exception.category, "invalid_response")


if __name__ == "__main__":
    unittest.main()