# KURA Notes - User Guide

**Welcome to KURA Notes!** This guide will help you capture, search, and manage your personal knowledge base.

---

## Quick Start

### First Time Setup

1. **Access KURA:** Open https://kura.tillmaessen.de
2. **Set API Key:**
   - Press F12 (or Cmd+Option+I on Mac) to open browser console
   - Type: `localStorage.setItem('apiKey', 'YOUR_API_KEY')`
   - Press Enter
   - Refresh the page (Cmd+R or F5)
3. **You're ready!** The interface should now load.

---

## Capturing Content

### From Web Interface

**Create a Text Note:**
1. Click **"New Note"** button
2. Enter your content in the text area
3. (Optional) Add a title
4. (Optional) Add tags (comma-separated)
5. (Optional) Add annotation for context
6. Click **"Save"** or press Cmd+Enter

**Tips:**
- Use markdown formatting in notes
- Add tags immediately for better organization
- Annotations help add context you might forget later

---

### From iPhone (iOS Shortcut)

**Setup (One Time):**

1. **Open Shortcuts app**
2. **Create New Shortcut:**
   - Tap "+" to create new shortcut
   - Add "Get Contents of URL" action
   
3. **Configure the action:**
   - **URL:** `https://kura.tillmaessen.de/api/capture`
   - **Method:** POST
   - **Headers:** Tap "Add new header"
     - Key: `Authorization`
     - Value: `Bearer YOUR_API_KEY`
   - **Request Body:** JSON
     - Key: `content`, Value: [Shortcut Input]
     - Key: `type`, Value: `text`

4. **Name it:** "Save to KURA" or similar

5. **Enable in Share Sheet:**
   - Tap the settings icon
   - Enable "Show in Share Sheet"
   - Choose content types (Text, Safari Web Pages, etc.)

**Using the Shortcut:**

1. **From any app:** Tap Share button
2. **Select:** "Save to KURA" (or your shortcut name)
3. **Done!** Content is captured

**What you can capture:**
- ✅ Text from any app
- ✅ Web pages from Safari
- ✅ Notes from Apple Notes
- ✅ Photos (saved as attachments)
- ✅ Screenshots

**Note:** iOS-captured notes will have title "Untitled" - this is expected MVP behavior. You can edit titles in the web interface later.

---

## Searching Content

### Basic Search

1. **Click the search box** at the top of the page
2. **Type your query** in natural language
3. **Press Enter** or click search button
4. **View results** sorted by relevance

**Example Queries:**
- "meeting notes from last week"
- "docker deployment issues"
- "project alpha planning"
- "recipes with chicken"

### How Semantic Search Works

KURA uses AI-powered semantic search, which means:
- ✅ Understands **meaning**, not just keywords
- ✅ Finds related concepts
- ✅ Works with natural language

**Example:**
- Search: "how to fix broken containers"
- Finds: Notes about "docker troubleshooting", "container won't start", etc.
- Even if those exact words aren't in the note!

### Search Tips

**Be Specific:**
- ❌ "notes" (too broad)
- ✅ "meeting notes about Q4 planning"

**Use Natural Language:**
- ❌ "docker+error+port"
- ✅ "docker container port conflict error"

**Think About Context:**
- Instead of just keywords, describe what you're looking for
- "I need the recipe I saved with garlic and lemon"

**Refine Your Search:**
- If you get too many results, add more detail
- If you get too few, try broader terms

---

## Managing Content

### View Content

**Browse All Content:**
- Scroll through the main list
- Newest items appear first
- Click any item to view full details

**Filter by Type:**
- Look for filter options (text, images, PDFs)
- Narrow down what you're looking for

**View Details:**
- Click on any note to see:
  - Full content
  - Creation date
  - Tags
  - Annotations
  - File attachments (if any)

### Edit Content

**Currently (MVP):**
- ❌ Cannot edit content directly
- ✅ Can delete and recreate
- 📋 Phase 2: Full editing capability

**Workaround:**
1. View the content you want to edit
2. Copy the text
3. Create a new note with updated content
4. Delete the old note

### Delete Content

1. **View the content** you want to delete
2. **Click "Delete" button**
3. **Confirm deletion**
4. **Done!** Content is permanently removed

**⚠️ Warning:** Deletion is permanent. There's no undo (yet).

---

## Organization Tips

### Tagging Strategy

**Use Consistent Tags:**
```
✅ Good: meeting-notes, project-alpha, important
❌ Bad: Meeting Notes, ProjectAlpha, IMPORTANT!!!
```

**Common Tag Patterns:**

**By Type:**
- `article` - Articles you've saved
- `note` - Personal notes
- `reference` - Reference material
- `idea` - Ideas and brainstorming

**By Project:**
- `work` - Work-related
- `personal` - Personal stuff
- `project-name` - Specific projects

**By Status:**
- `todo` - Action items
- `done` - Completed
- `review` - Need to review later

**By Topic:**
- `design`, `code`, `business`, etc.

### Naming Conventions

**Give Notes Descriptive Titles:**
- ❌ "Notes"
- ❌ "Untitled"
- ✅ "Docker Deployment Guide"
- ✅ "Meeting Notes - Q4 Planning - 2025-11-19"

**Include Dates in Titles:**
- Format: `YYYY-MM-DD` for easy sorting
- Example: "2025-11-19 - Team Standup Notes"

### Use Annotations

**Add Context You'll Forget:**
- Where did this come from?
- Why is this important?
- What action is needed?

**Example:**
```
Title: Docker Port Conflict Fix
Content: [Technical solution]
Annotation: "Found this after 2 hours debugging. 
Applies to Contabo VPS specifically."
```

---

## Common Workflows

### Capture Meeting Notes

**During Meeting (iPhone):**
1. Open Notes app
2. Take notes as usual
3. When done, share note → "Save to KURA"
4. Continue your day

**Later (Desktop):**
1. Search for today's date or meeting topic
2. Add tags like `meeting`, `project-name`
3. Add annotation with action items

### Save Articles for Later

**From Browser:**
1. Share page → "Save to KURA" shortcut
2. Done! Article is saved with full text

**Later:**
1. Search for the topic
2. Read when you have time
3. Tag with `read`, `important`, etc.

### Build a Knowledge Base

**Capture Everything:**
- Code snippets that work
- Solutions to problems you solved
- Interesting articles
- Random ideas

**Search When Needed:**
- "How did I fix that Docker issue?"
- Search and find your past solution instantly

**Organize Later:**
- Don't worry about organization upfront
- Semantic search finds it anyway
- Add tags/titles when you review

### Daily Review Workflow

**End of Day:**
1. Review "Untitled" notes from iOS
2. Add proper titles
3. Add tags for organization
4. Add annotations if needed
5. Delete anything unnecessary

**Weekly Review:**
1. Search for notes from past week
2. Follow up on action items
3. Archive or delete outdated content
4. Consolidate related notes

---

## Keyboard Shortcuts

**Web Interface:**

| Action | Shortcut |
|--------|----------|
| New Note | Cmd+N (Mac) / Ctrl+N (Windows) |
| Save Note | Cmd+Enter |
| Search | Cmd+K or / |
| Close Modal | Escape |

---

## Best Practices

### Capture Everything
- Don't filter too much upfront
- You can always delete later
- Search makes finding things easy

### Review Regularly
- Weekly: Review and organize
- Monthly: Clean up outdated content
- Archive what you don't need

### Use Natural Language
- Write notes how you think
- Don't worry about keywords
- Semantic search understands context

### Trust the Search
- Don't over-organize
- Tag lightly
- Search finds it anyway

### Keep It Simple
- One note per topic
- Clear titles
- Minimal tags

---

## Advanced Tips

### Search Operators (Future)

Currently not implemented, but planned for Phase 2:
- Date ranges: `after:2025-01-01`
- Tag filters: `tag:important`
- Type filters: `type:image`
- Combine: `docker tag:work after:2025-11-01`

### Batch Operations (Future)

Planned for Phase 2:
- Select multiple notes
- Bulk delete
- Bulk tag update
- Export selected notes

### Related Content (Future)

AI will suggest related notes automatically:
- "You might also be interested in..."
- Based on semantic similarity
- While viewing any note

---

## Mobile Tips

### iOS Shortcuts Tips

**Create Multiple Shortcuts:**
- "Quick Note to KURA" - Simple text
- "Save Article to KURA" - From Safari
- "Photo to KURA" - For screenshots

**Add to Home Screen:**
- Pin frequently used shortcuts
- Tap once to capture quickly

**Use Siri:**
- "Hey Siri, run Quick Note to KURA"
- Dictate your note
- Hands-free capture

### Browser on Mobile

**Add to Home Screen:**
1. Open Safari
2. Go to https://kura.tillmaessen.de
3. Tap Share → "Add to Home Screen"
4. Now it's like an app!

---

## Troubleshooting

### Can't See Content

**Check API Key:**
1. Open browser console (F12)
2. Type: `localStorage.getItem('apiKey')`
3. If null or wrong, reset it:
   ```javascript
   localStorage.setItem('apiKey', 'CORRECT_API_KEY')
   ```
4. Refresh page

### iOS Shortcut Not Working

**Check Authorization Header:**
- Must be: `Authorization`
- Must include: `Bearer ` (with space)
- Full value: `Bearer YOUR_API_KEY`

**Check URL:**
- Must be: `https://kura.tillmaessen.de/api/capture`
- Include `/api/capture` at the end

**Check Body Format:**
- Must be JSON
- Must include `content` and `type` fields

### Search Not Finding Anything

**Wait a Moment:**
- New content takes ~1 second to index
- Refresh and try again

**Check Your Query:**
- Try broader terms first
- Use natural language
- Don't use special characters

**Check Content Exists:**
- Browse the list manually
- Verify content was actually saved

---

## Getting Help

**Check Logs (if you have server access):**
```bash
docker-compose logs -f api
```

**Common Issues:**
- See TROUBLESHOOTING.md
- Check GitHub Issues

**Feature Requests:**
- Open an issue on GitHub
- Describe your use case
- Include examples

---

## What's Next (Phase 2)

**Coming Soon:**
- ✏️ Edit content in place
- 📁 Folders and collections
- 🔍 Advanced search filters
- 📊 Statistics and insights
- 🎨 Better mobile interface
- 🔒 Enhanced security options
- 📤 Export functionality
- 🎯 Related content suggestions

---

**Need Help?** See TROUBLESHOOTING.md or API-DOCS.md for technical details.

**Last Updated:** 2025-11-19
