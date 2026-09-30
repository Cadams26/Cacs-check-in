1. **Change background color:** Update the `body` background class in `index.html`. It currently uses `bg-gray-50`. Change it to `bg-white` or remove the gray background to ensure it is clean white.
2. **Update the Idle View Enter button:**
    - The button is currently in `#view-idle`. Update the `circle-btn` class or the inline styles.
    - Remove the `aura-blue` box-shadow.
    - Make the circle a perfect line with `border border-gray-200`.
    - Add a gentle pulsing glow using an animation class (e.g., a custom `animate-pulse-glow` in CSS) that waits for input.
    - Remove the blue text color from the word "Enter" to keep it clean, maybe just use standard black or dark gray `text-gray-900`.
3. **Add Greeting message to Check-in page (Zones view):**
    - The Check-in page is `view-zones`.
    - Add a greeting message at the top of the `#view-zones` container.
    - Use clean, floating text (e.g., `text-2xl font-light text-gray-800 text-center mb-6`).
    - Text content: something like "Welcome, we're glad you're here."
4. **Complete pre-commit steps:** Run `pre_commit_instructions` and follow the directions.
5. **Submit:** Submit the changes with a clear description of the new landing page UI and check-in greeting.
