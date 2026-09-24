#!/usr/bin/env python3
"""Compose the 59 s GravelKing Pro promo from REAL captures.

  stage      headless recording of the live duet Main Stage (two peers over WebRTC)
  mastering  recording of the Mastering Tool running a real MLK V4 master
  audio      the user's track (raw) switching to its real MLK V4 master at 0:30

Captions are ffmpeg drawtext overlays on top of the real UI — no mock scenes.
"""
import os, subprocess, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
E = os.environ.get
STAGE_WEBM   = E("STAGE_WEBM", "/tmp/promo/stage2/stage_raw.webm")
STAGE_OFFSET = float(E("STAGE_OFFSET", "16.96"))      # flash marker = song 0:00
MASTER_WEBM  = E("MASTER_WEBM", "/tmp/promo/mastering/mastering_raw.webm")
RAW_WAV      = E("RAW_WAV", "/tmp/promo/stage_window.wav")
MASTERED_WAV = E("MASTERED_WAV", "/tmp/promo/mastered_baseline.wav")
ICON         = E("ICON", str(HERE / "../../gravelkingpro/public/icon-512.png"))
OUT          = E("OUT", str(HERE / "../public/videos/gravelkingpro_live_duet_stage_59s_16x9.mp4"))
FONT         = E("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
DUR = 59
SWITCH = 30.0            # raw → mastered audio switch
XF = 0.35                # crossfade length
# Mastering capture cut points (marks.json): preset ~5.0, click 6.38, spinner→33.94, EQ 36.95, A/B play 38.84
M_A = (4.6, 4.4)         # preset → click → spinner starts   (promo 25.0–29.4)
M_B = (32.4, 15.6)       # spinner ends → result → EQ → play (promo 29.4–45.0)

GOLD, VIOLET, WHITE, RED, CYAN = "0xF5C542", "0xB794F4", "white", "0xFF3B3B", "0x30E8FF"

def esc(t: str) -> str:
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace(",", "\\,").replace("%", "\\%")

def fade(s, e):
    return f"alpha='if(lt(t-{s},0.25),(t-{s})/0.25,if(gt(t-{e},-0.35),max(0,({e}-t)/0.35),1))'"

def txt(text, size, color, x, y, s, e, border=3, extra_enable="", do_fade=True):
    en = f"between(t,{s},{e})" + (f"*{extra_enable}" if extra_enable else "")
    f = f"drawtext=fontfile={FONT}:text='{esc(text)}':fontsize={size}:fontcolor={color}:borderw={border}:bordercolor=black@0.85:x={x}:y={y}:enable='{en}'"
    if do_fade: f += ":" + fade(s, e)
    return f

C = "(w-tw)/2"
caps = [
    # hook 0:00–0:08
    txt("LAG?  OFF-KEY?  WEAK AUDIO?", 84, RED,  f"{C}+6", "h*0.42-4", 1.5, 4.5, border=0, extra_enable="lt(mod(t*7,1),0.35)", do_fade=False),
    txt("LAG?  OFF-KEY?  WEAK AUDIO?", 84, CYAN, f"{C}-6", "h*0.42+4", 1.5, 4.5, border=0, extra_enable="lt(mod(t*5+0.3,1),0.35)", do_fade=False),
    txt("LAG?  OFF-KEY?  WEAK AUDIO?", 84, WHITE, C, "h*0.42", 1.5, 4.5),
    txt("CAN YOUR STAGE DO THIS LIVE?", 96, GOLD, C, "h*0.40", 4.7, 8.2, border=4),
    # duet sync 0:08–0:25
    "drawbox=x=0:y=ih*0.855:w=iw:h=ih*0.075:color=black@0.62:t=fill:enable='between(t,9,15)'",
    txt("REAL DUET STAGE   |   LIVE ROLLING LYRICS   |   ZERO LATENCY", 44, WHITE, C, "h*0.868", 9, 15, border=0),
    txt("2 SINGERS  ·  1 STAGE  ·  PEER-TO-PEER LIVE SYNC", 40, VIOLET, C, "h*0.72", 16, 23),
    # mastering 0:25–0:45
    txt("SEND THE TAKE TO THE STUDIO", 40, WHITE, "w*0.05", "h*0.77", 25.3, 29.3),
    txt("MLK V4 MASTERING ACTIVE", 56, GOLD, "w*0.05", "h*0.745", 30, 35.5, border=4),
    txt("raw take  →  studio master  ·  real MLK V4 render", 32, WHITE, "w*0.05", "h*0.745+72", 30.4, 35.5),
    txt("JAX STUDIO   |   LIVE STUDIO MASTERING", 44, WHITE, "w*0.05", "h*0.745", 37, 44.5, border=4),
    txt("Fine-tune EQ  ·  A/B before and after  ·  24-bit export", 32, GOLD, "w*0.05", "h*0.745+62", 37.4, 44.5),
    # CTA 0:45–0:59 over the chorus drop
    "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,47)'",
    txt("GRAVELKING PRO", 120, GOLD, C, "h*0.30", 47.2, 58.8, border=4),
    txt("Real duet stage.  Rolling lyrics.  Studio mastering.", 54, WHITE, C, "h*0.30+150", 48, 58.8),
    txt("SING IT LIVE  →  gravelkingpro.com", 72, WHITE, C, "h*0.62", 51, 58.8, border=4),
    txt("Free to start  ·  works in your browser  ·  no install", 38, GOLD, C, "h*0.62+100", 52.5, 58.8),
]

filt = f"""
[0:v]trim=start={STAGE_OFFSET}:duration={DUR},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[stage];
[1:v]trim=start={M_A[0]}:duration={M_A[1]},setpts=PTS-STARTPTS,fps=30[ma];
[1:v]trim=start={M_B[0]}:duration={M_B[1]},setpts=PTS-STARTPTS,fps=30[mb];
[ma][mb]concat=n=2:v=1:a=0,scale=1920:1080,crop=720:820:600:200,scale=760:866,pad=776:882:8:8:color={GOLD}@0.85,format=yuva420p,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=19.4:d=0.6:alpha=1,setpts=PTS+25/TB[pip];
[stage][pip]overlay=x=W-w-56:y=(H-h)/2-10:eof_action=pass[withpip];
[4:v]scale=160:160,format=rgba[icon];
[withpip][icon]overlay=x=(W-w)/2:y=H*0.30-190:enable='gte(t,47.2)'[base];
[base]{",".join(caps)},fade=t=in:st=0:d=0.4,fade=t=out:st=58.2:d=0.8[vout];
[2:a]atrim=0:{DUR},asetpts=PTS-STARTPTS,volume=-3.8dB,afade=t=out:st={SWITCH-XF/2:.3f}:d={XF}[raw];
[3:a]atrim=0:{DUR},asetpts=PTS-STARTPTS,afade=t=in:st={SWITCH-XF/2:.3f}:d={XF}[mst];
[raw]volume='if(lt(t,{SWITCH}),1,0)':eval=frame[rawg];
[mst]volume='if(lt(t,{SWITCH}),0,1)':eval=frame[mstg];
[rawg][mstg]amix=inputs=2:duration=first:normalize=0,volume=-2.3dB,afade=t=out:st=56.8:d=2.2,aresample=48000[aout]
""".strip()

cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
       "-i", STAGE_WEBM, "-i", MASTER_WEBM, "-i", RAW_WAV, "-i", MASTERED_WAV, "-loop", "1", "-t", "1", "-i", ICON,
       "-filter_complex", filt, "-map", "[vout]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2", "-r", "30",
       "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-t", str(DUR), "-movflags", "+faststart", OUT]
pathlib.Path(OUT).parent.mkdir(parents=True, exist_ok=True)
subprocess.run(cmd, check=True)
print("Wrote", OUT)
