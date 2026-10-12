import base64
import binascii
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, time
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent
MIN_FACE_SAMPLES = 3
MAX_FACE_SAMPLES = 10
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "65"))
FACE_CASCADE = cv2.CascadeClassifier(
    str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
)
if FACE_CASCADE.empty():
    raise RuntimeError("OpenCV could not load its frontal-face detection model.")
if not hasattr(cv2, "face") or not hasattr(cv2.face, "LBPHFaceRecognizer_create"):
    raise RuntimeError(
        "OpenCV face recognition is unavailable. Install opencv-contrib-python, "
        "not opencv-python."
    )