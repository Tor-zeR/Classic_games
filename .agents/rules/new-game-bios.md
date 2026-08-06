# Rule: Update BIOS Startup Loading Sequence for New Games

Whenever a new game is created or added to the repository:

1. **Root `index.html` BIOS Sequence**:
   - Locate the `steps` array inside the `<script>` tag for POST / BIOS boot sequence in `index.html`.
   - Add a line for the new game under `Loading Game Cartridges:` using its display name:
     ```javascript
     { text: '  > <DISPLAY_NAME>............[OK]', delay: 140, cls: 'bios-game' },
     ```
   - Update the total cartridges count line to reflect the new count:
     ```javascript
     { text: '<N> CARTRIDGES READY.', delay: 380 },
     ```

2. **Checklist Verification**:
   - Ensure the new game is listed in the BIOS loading screen animation.
   - Verify that the count matches the total number of playable games.
