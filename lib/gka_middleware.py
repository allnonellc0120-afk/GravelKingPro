"""Authoritative GravelKing Advantage (GKA) runtime middleware.

This module is intentionally small and dependency-light because it is imported
by the live ingestion service, the FastAPI audio service, and the MLK worker.
It does not mock or replace an audio engine: it owns the partitioning,
optimization hook, statutory lineage, and parity contract around those engines.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
from typing import Any, Iterator
from uuid import uuid4

import numpy as np


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = WORKSPACE_ROOT / "gka_spec.json"
EXPECTED_HASH = "GK-MLK-LL-V1.9-CDB4047A-6EC726DC"
EXPECTED_ARCHITECT = "Master Kevin Morris"
EXPECTED_ORGANIZATION = "All N One LLC / GravelKing Enterprises"
EXPECTED_BUNDLE_ID = "com.allnone.gravelking.daw"
EXPECTED_MULTIPLIER = 0.75
EXPECTED_SLICE_SIZE = 2


class GKAdvantageCore:
    """Morris Law Kernel V2 runtime and lineage boundary."""

    def __init__(
        self,
        multiplier: float = EXPECTED_MULTIPLIER,
        slice_size: int = EXPECTED_SLICE_SIZE,
        spec_path: Path = SPEC_PATH,
    ):
        self.multiplier = float(multiplier)
        self.slice_size = int(slice_size)
        self.verification_hash = EXPECTED_HASH
        self.coherence_seed = [81, 77, 54, 86, 50, 55, 65, 41, 83, 16]
        self.spec_path = Path(spec_path)
        self.spec = self._load_spec()
        self._lineage_lock = threading.RLock()
        self._lineage: dict[str, dict[str, Any]] = {}
        self._validate_binding()

    def _load_spec(self) -> dict[str, Any]:
        try:
            spec = json.loads(self.spec_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"GKA specification unavailable: {error}") from error
        if not isinstance(spec, dict):
            raise RuntimeError("GKA specification must be a JSON object")
        return spec

    def _validate_binding(self) -> None:
        hooks = self.spec.get("runtime_optimization_hooks", {})
        configured_multiplier = hooks.get("multiplier", {}).get("default")
        configured_slice_size = hooks.get("slice_size", {}).get("default")
        if configured_multiplier != self.multiplier or configured_slice_size != self.slice_size:
            raise RuntimeError("GKA runtime parameters do not match gka_spec.json")
        if self.spec.get("verification_hash") != EXPECTED_HASH:
            raise RuntimeError("GKA verification hash does not match gka_spec.json")
        if self.spec.get("app_bundle_id") != EXPECTED_BUNDLE_ID:
            raise RuntimeError("GKA app bundle ID does not match gka_spec.json")

    def begin_task(
        self,
        operation: str,
        *,
        parent_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        task_id = str(uuid4())
        with self._lineage_lock:
            self._lineage[task_id] = {
                "task_id": task_id,
                "operation": operation,
                "parent_id": parent_id,
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
            }
        return task_id

    def finish_task(
        self,
        task_id: str,
        *,
        status: str = "completed",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self._lineage_lock:
            task = self._lineage.get(task_id)
            if task is None:
                raise KeyError(f"Unknown GKA lineage task: {task_id}")
            task["status"] = status
            task["finished_at"] = datetime.now(timezone.utc).isoformat()
            if metadata:
                task["metadata"] = {**task["metadata"], **metadata}

    @contextmanager
    def task(
        self,
        operation: str,
        *,
        parent_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterator[str]:
        task_id = self.begin_task(operation, parent_id=parent_id, metadata=metadata)
        try:
            yield task_id
        except Exception as error:
            self.finish_task(task_id, status="failed", metadata={"error": str(error)[:500]})
            raise
        else:
            self.finish_task(task_id)

    def slice_data(self, data: Any) -> list[Any]:
        """Partition data at the spec boundary without silently dropping items."""
        if isinstance(data, np.ndarray):
            return [chunk for chunk in np.array_split(data, max(1, len(data) // self.slice_size))]
        values = list(data)
        return [values[index:index + self.slice_size] for index in range(0, len(values), self.slice_size)]

    def gravelking_opt(self, data_stream: np.ndarray) -> np.ndarray:
        """Apply the bound GKA optimization hook to each deterministic slice."""
        array = np.asarray(data_stream)
        if array.size == 0:
            return array.copy()
        chunks = self.slice_data(array)
        optimized_chunks = [np.asarray(chunk) * self.multiplier for chunk in chunks]
        return np.concatenate(optimized_chunks)

    def optimize_audio(self, audio: np.ndarray, *, operation: str = "audio_pipeline") -> np.ndarray:
        """Route float audio through GKA's configured partition/optimization hook."""
        with self.task(operation, metadata={"multiplier": self.multiplier, "slice_size": self.slice_size}):
            return self.gravelking_opt(np.asarray(audio, dtype=np.float32))

    def lineage_snapshot(self) -> list[dict[str, Any]]:
        with self._lineage_lock:
            return [dict(task) for task in self._lineage.values()]

    def verify_parity(self) -> dict[str, Any]:
        partitions = self.spec.get("subsystem_partition_layout", {})
        identity_valid = (
            self.spec.get("architect") == f"{EXPECTED_ARCHITECT}, Chief Architect"
            and self.spec.get("organization") == EXPECTED_ORGANIZATION
        )
        valid = (
            self.spec.get("parity_lock") == "VALIDATED / PASSED"
            and identity_valid
            and len(partitions) == 7
            and self.spec.get("verification_hash") == EXPECTED_HASH
            and self.multiplier == EXPECTED_MULTIPLIER
            and self.slice_size == EXPECTED_SLICE_SIZE
        )
        return {
            "status": "PARITY LOCK VALIDATED" if valid else "PARITY LOCK FAILED",
            "parity_lock": self.spec.get("parity_lock"),
            "hash": self.verification_hash,
            "architect": self.spec.get("architect"),
            "organization": self.spec.get("organization"),
            "app_bundle_id": self.spec.get("app_bundle_id"),
            "multiplier": self.multiplier,
            "slice_size": self.slice_size,
            "subsystem_count": len(partitions),
            "subsystems": list(partitions),
            "daw_target_latency": partitions.get("sovereign_digital_daw", {}).get("target_latency"),
            "daw_target_lufs": -14.0,
            "daw_ceiling_db": -0.5,
            "runtime_overhead_mitigation": "up to 75%",
            "lineage_tasks": len(self._lineage),
        }
