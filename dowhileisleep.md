Claude, this is a long session. If you hit the Rate Limit (API/Token limit error) while working, please follow this 'Sleep & Retry' protocol:

Detection: If you receive a 'Rate limit reached' or 429 error from the provider.

Wait: Do not crash. Use a terminal command like sleep 3600 (1 hour) to pause the process.

Resume: After the sleep timer ends, automatically retry the current sub-task from where you left off.

Logging: Before sleeping, print a clear message in the terminal: 'Rate limit hit. Sleeping for 1 hour... Resume time: [Estimated Time].'

Iteration: Keep repeating this cycle until the task is complete or you've tried 5 times.

Please incorporate this logic into your task execution loop tonight.

Role: You are acting as a Senior Full-stack Developer.
Standard Operating Procedure:

Sequential Execution: You must complete these tasks one at a time.

Test-Driven Verification: After each task, create or update a Playwright/Vitest snapshot test to verify the UI change.

Claude, for the list of tasks I just assigned below, please follow this strict Branching Protocol:

Isolation: For EACH task, create a fresh branch from the current stable main (e.g., feature/task-1-sidebar, feature/task-2-popup-polish, etc.).

Work & Test: Complete the task and ensure the snapshot test passes on that specific branch.

Commit & Push: Once the test passes, git add ., git commit -m "Completed Task X", and git push origin [branch-name].

Merge Back (Optional): If the task is successful, merge it back into main so the next task starts from the updated codebase. If you are unsure, just keep the branches separate.

Report: Leave a summary in the terminal showing which branches were pushed successfully.

This way, I can review each milestone individually tomorrow morning.

Task 1: Desktop Sidebar Refinement
Target: src/components/Search/ListView (or equivalent).

Action:

On screens wider than 1280px, reduce the Sidebar width to 80% (4/5) of its current value.

UI Cleanup: Find the property list cards and remove the text label "House for Sale". Remove Listed on yyyy-mm-dd on list cards

Verification: Snapshot test must confirm the sidebar width reduction and the absence of the "House for Sale" string.

Task 2: Map Popup (Clustering) Polish
Target: src/components/Map/ClusterPopup (or equivalent).

Action:

Header Cleanup: Identify and remove the empty/blank top section within the cluster popup.

Spacing: Reduce the overall margin and padding of the popup container to make it more compact and professional.

Remove the "Save Search" button and the "Heart (Favorite)" icons from these specific clustering popups to keep them minimal.

Verification: Snapshot test of the popup component.

Task 3: Listing Detail Gallery Interaction
Target: src/components/Property/Gallery.

Action:

Navigation: Add left/right navigation arrows to the main Hero image.

Logic Change: Update the thumbnail click behavior. Disable the full-screen lightbox popup on click. Instead, clicking a thumbnail must only update the Main Display Photo at the top.

Verification: Interaction test ensuring thumbnail click updates the state but does not trigger a modal/portal.

Task 4: Map Global Filters
Target: src/components/Map/Header or Controls.

Action:

Feature: Add a minimalist dropdown menu in the Top-Left corner of the map.

Options: "For Sale" and "For Lease".

State: Ensure selecting an option filters the visible markers accordingly.

Verification: Test ensuring the dropdown exists and triggers a state update.

Task 5: I've chosen 'Map. Click. Tour.' as the official slogan for Yollow.

Please update the header section on landing page to feature this slogan in a clean, minimalist font (uppercase preferred, e.g., tracking-widest font-light). Ensure it matches the premium, friction-less vibe we are building.

Redesign the Yollow logo to a more modern minimalist look. Archive the old logo first before you do so.