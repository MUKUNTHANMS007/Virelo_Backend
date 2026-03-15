import os
import sys
import shutil

print("--- DIAGNOSTIC START ---")
print(f"Python Version: {sys.version}")
print(f"CWD: {os.getcwd()}")

main_path = "main.py"
if os.path.exists(main_path):
    print(f"Found {main_path}, size: {os.path.getsize(main_path)}")
    with open(main_path, "r") as f:
        lines = f.readlines()
        print(f"Total lines: {len(lines)}")
        # Check specific lines around the crash area
        for i in range(max(0, 40), min(len(lines), 60)):
            print(f"{i+1}: {lines[i].strip()}")
else:
    print(f"CRITICAL: {main_path} NOT FOUND")

print("\n--- TESTING OPENCV ---")
try:
    import cv2
    import numpy as np
    print(f"OpenCV Version: {cv2.__version__}")
    
    test_video = "test_diagnostics.mp4"
    width, height = 640, 360
    # Try avc1
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(test_video, fourcc, 24, (width, height))
    if not out.isOpened():
        print("Codec 'avc1' FAILED to open")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(test_video, fourcc, 24, (width, height))
        if not out.isOpened():
             print("Codec 'mp4v' also FAILED")
        else:
             print("Codec 'mp4v' SUCCESS")
    else:
        print("Codec 'avc1' SUCCESS")
    
    if out.isOpened():
        for _ in range(10):
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            out.write(frame)
        out.release()
        print(f"Test video created: {test_video}, size: {os.path.getsize(test_video)}")
    
except Exception as e:
    print(f"OpenCV ERROR: {e}")

print("--- DIAGNOSTIC END ---")
