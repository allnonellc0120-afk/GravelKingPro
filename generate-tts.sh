#!/bin/bash
export PATH=$PATH:/home/runner/.local/bin

edge-tts --voice en-US-AriaNeural --text "Idea first. A night. A person. One line you cannot forget." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene1.mp3
edge-tts --voice en-US-AriaNeural --text "Give it detail. Your story becomes a direction, not a blank prompt. Concrete plot, specific metaphors." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene2.mp3
edge-tts --voice en-US-AriaNeural --text "Generate options. GravelKing Pro gives you a usable first pass, while the idea is still yours." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene3.mp3
edge-tts --voice en-US-AriaNeural --text "Edit and arrange. Move sections. Change the hook. Total control." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene4.mp3
edge-tts --voice en-US-AriaNeural --text "The workflow. Master it. Your sound, your way." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene5.mp3
edge-tts --voice en-US-AriaNeural --text "Document authorship. GravelKing Pro is built around editability and authorship documentation." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene6.mp3
edge-tts --voice en-US-AriaNeural --text "Finish. Own your work from the first spark to the final master." --write-media artifacts/gravelkingpro-promo/public/audio/vo_scene7.mp3

ls -la artifacts/gravelkingpro-promo/public/audio/vo_scene*
