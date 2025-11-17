# iOS Shortcut Actions Reference

This document shows the exact shortcut actions needed to build the "Save to Kura" shortcut.

## Text-Only Version (Recommended for MVP)

This is the simplest version that works reliably for text capture.

```
┌─────────────────────────────────────────────────┐
│  Shortcut: Save to Kura (Text Only)            │
│  Share Sheet: Text ✓                            │
└─────────────────────────────────────────────────┘

 1  ┌──────────────────────────────────────┐
    │  Ask for Input                       │
    │  Prompt: "Annotation (optional)"     │
    │  Type: Text                          │
    │  Allow Multiple Lines: ON            │
    └──────────────────────────────────────┘

 2  ┌──────────────────────────────────────┐
    │  Set Variable                        │
    │  Name: UserAnnotation                │
    │  Value: Provided Input               │
    └──────────────────────────────────────┘

 3  ┌──────────────────────────────────────┐
    │  Ask for Input                       │
    │  Prompt: "Tags (comma-separated)"    │
    │  Type: Text                          │
    └──────────────────────────────────────┘

 4  ┌──────────────────────────────────────┐
    │  Set Variable                        │
    │  Name: UserTags                      │
    │  Value: Provided Input               │
    └──────────────────────────────────────┘

 5  ┌──────────────────────────────────────┐
    │  Get Contents of URL                 │
    │                                      │
    │  URL:                                │
    │    http://192.168.1.100:3000/api/    │
    │    capture                           │
    │                                      │
    │  Method: POST                        │
    │                                      │
    │  Headers:                            │
    │    Authorization:                    │
    │      Bearer YOUR_API_KEY             │
    │    Content-Type:                     │
    │      application/json                │
    │                                      │
    │  Request Body: JSON                  │
    │    {                                 │
    │      "content": [Shortcut Input],    │
    │      "annotation": [UserAnnotation], │
    │      "tags": [UserTags split by ","] │
    │    }                                 │
    └──────────────────────────────────────┘

 6  ┌──────────────────────────────────────┐
    │  Get Dictionary Value                │
    │  Key: "success"                      │
    │  Dictionary: Contents of URL         │
    └──────────────────────────────────────┘

 7  ┌──────────────────────────────────────┐
    │  If [Dictionary Value is true]       │
    └──────────────────────────────────────┘

 8      ┌──────────────────────────────────┐
        │  Show Notification               │
        │  Title: "Saved to Kura!"         │
        │  Body: "Content captured"        │
        └──────────────────────────────────┘

 9  ┌──────────────────────────────────────┐
    │  Otherwise                           │
    └──────────────────────────────────────┘

10      ┌──────────────────────────────────┐
        │  Get Dictionary Value            │
        │  Key: "message"                  │
        │  Dictionary: Contents of URL     │
        └──────────────────────────────────┘

11      ┌──────────────────────────────────┐
        │  Show Alert                      │
        │  Message: [Dictionary Value]     │
        └──────────────────────────────────┘

12  ┌──────────────────────────────────────┐
    │  End If                              │
    └──────────────────────────────────────┘
```

**Total Actions:** 12

---

## Minimal Version (3 Actions)

If you want the absolute simplest shortcut with no prompts:

```
 1  ┌──────────────────────────────────────┐
    │  Get Contents of URL                 │
    │  URL: http://192.168.1.100:3000/api/ │
    │       capture                        │
    │  Method: POST                        │
    │  Headers:                            │
    │    Authorization: Bearer YOUR_API_KEY│
    │    Content-Type: application/json    │
    │  Request Body:                       │
    │    { "content": [Shortcut Input] }   │
    └──────────────────────────────────────┘

 2  ┌──────────────────────────────────────┐
    │  Show Notification                   │
    │  Title: "Saved!"                     │
    └──────────────────────────────────────┘
```

**Total Actions:** 2

---

## Full Version (Text + Images + PDFs)

This version handles all content types.

```
┌─────────────────────────────────────────────────┐
│  Shortcut: Save to Kura (Full Version)         │
│  Share Sheet: Text ✓ Images ✓ Files ✓          │
└─────────────────────────────────────────────────┘

 1  ┌──────────────────────────────────────┐
    │  Ask for Input                       │
    │  Prompt: "Annotation (optional)"     │
    │  Type: Text                          │
    │  Allow Multiple Lines: ON            │
    └──────────────────────────────────────┘

 2  ┌──────────────────────────────────────┐
    │  Set Variable                        │
    │  Name: UserAnnotation                │
    └──────────────────────────────────────┘

 3  ┌──────────────────────────────────────┐
    │  Ask for Input                       │
    │  Prompt: "Tags (comma-separated)"    │
    └──────────────────────────────────────┘

 4  ┌──────────────────────────────────────┐
    │  Set Variable                        │
    │  Name: UserTags                      │
    └──────────────────────────────────────┘

 5  ┌──────────────────────────────────────┐
    │  Get Type                            │
    │  Input: Shortcut Input               │
    └──────────────────────────────────────┘

 6  ┌──────────────────────────────────────┐
    │  If [Type is Text]                   │
    └──────────────────────────────────────┘

 7      ┌──────────────────────────────────┐
        │  Get Text from Input             │
        │  Text: Shortcut Input            │
        └──────────────────────────────────┘

 8      ┌──────────────────────────────────┐
        │  Get Contents of URL             │
        │  URL: http://YOUR_SERVER:3000/   │
        │       api/capture                │
        │  Method: POST                    │
        │  Headers:                        │
        │    Authorization: Bearer API_KEY │
        │    Content-Type: application/json│
        │  Request Body: JSON              │
        │    {                             │
        │      "content": [Text],          │
        │      "annotation": [UserAnnot.], │
        │      "tags": [UserTags]          │
        │    }                             │
        └──────────────────────────────────┘

 9  ┌──────────────────────────────────────┐
    │  Otherwise If [Type is Image]        │
    └──────────────────────────────────────┘

10      ┌──────────────────────────────────┐
        │  Get Contents of URL             │
        │  URL: http://YOUR_SERVER:3000/   │
        │       api/capture                │
        │  Method: POST                    │
        │  Headers:                        │
        │    Authorization: Bearer API_KEY │
        │  Request Body: Form              │
        │    file: [Shortcut Input]        │
        │    annotation: [UserAnnotation]  │
        │    tags: [UserTags]              │
        │                                  │
        │  NOTE: Multipart metadata is     │
        │  complex in iOS Shortcuts.       │
        │  See workaround below.           │
        └──────────────────────────────────┘

11  ┌──────────────────────────────────────┐
    │  Otherwise If [Type is File]         │
    └──────────────────────────────────────┘

12      ┌──────────────────────────────────┐
        │  (Same as images - action 10)    │
        └──────────────────────────────────┘

13  ┌──────────────────────────────────────┐
    │  Otherwise                           │
    └──────────────────────────────────────┘

14      ┌──────────────────────────────────┐
        │  Show Alert                      │
        │  Message: "Unsupported type"     │
        └──────────────────────────────────┘

15      ┌──────────────────────────────────┐
        │  Stop and Output                 │
        └──────────────────────────────────┘

16  ┌──────────────────────────────────────┐
    │  End If                              │
    └──────────────────────────────────────┘

17  ┌──────────────────────────────────────┐
    │  Get Dictionary Value                │
    │  Key: "success"                      │
    │  Dictionary: Contents of URL         │
    └──────────────────────────────────────┘

18  ┌──────────────────────────────────────┐
    │  If [Dictionary Value is true]       │
    └──────────────────────────────────────┘

19      ┌──────────────────────────────────┐
        │  Show Notification               │
        │  Title: "Saved to Kura!"         │
        │  Body: "Content captured!"       │
        └──────────────────────────────────┘

20  ┌──────────────────────────────────────┐
    │  Otherwise                           │
    └──────────────────────────────────────┘

21      ┌──────────────────────────────────┐
        │  Get Dictionary Value            │
        │  Key: "message"                  │
        │  Dictionary: Contents of URL     │
        └──────────────────────────────────┘

22      ┌──────────────────────────────────┐
        │  Show Alert                      │
        │  Message: "Failed: [message]"    │
        └──────────────────────────────────┘

23  ┌──────────────────────────────────────┐
    │  End If                              │
    └──────────────────────────────────────┘
```

**Total Actions:** 23

---

## Multipart Form Data Challenge

### The Problem

iOS Shortcuts "Get Contents of URL" action with "Form" request body has limitations:
- Can send file data ✓
- Cannot easily send complex JSON metadata with file ✗

### Workaround Options

#### Option A: Server Modification (Easiest)

Modify the API to accept metadata as separate form fields instead of JSON:

```
Request Body: Form
  file: [Shortcut Input]
  title: [Title variable]
  annotation: [UserAnnotation variable]
  tags: [UserTags variable]
```

Then update server code to parse form fields directly.

#### Option B: Use Scriptable App

Use the free "Scriptable" app to build proper multipart requests with JavaScript:

```javascript
// Scriptable script example
let apiKey = "your-api-key";
let serverUrl = "http://192.168.1.100:3000/api/capture";

let file = args.shortcutParameter;
let annotation = await Notification.prompt("Annotation?");

let request = new Request(serverUrl);
request.method = "POST";
request.headers = {
  "Authorization": `Bearer ${apiKey}`
};

// Build multipart form data
let formData = new FormData();
formData.append("file", file);
formData.append("metadata", JSON.stringify({
  annotation: annotation
}));

request.body = formData;
let response = await request.loadJSON();

if (response.success) {
  Notification.post("Saved!", "Content captured");
} else {
  Notification.post("Error", response.message);
}
```

Then call this script from iOS Shortcuts using "Run Script" action.

#### Option C: Text-Only for Now

For the MVP, use the text-only version which works perfectly. Add file support later when you can test with a real device.

---

## JSON Request Body Format

When building the JSON for "Get Contents of URL":

### Text Request:

```json
{
  "content": [Shortcut Input or Text variable],
  "title": [Optional title variable],
  "annotation": [Optional annotation variable],
  "tags": [Tags variable as list]
}
```

### How to Split Tags:

If tags come from text input (comma-separated), use:

1. **Split Text** action
   - Text: `UserTags`
   - Separator: `,`

2. This creates a list that can be used in the JSON `tags` array

---

## Headers Configuration

All requests need these headers:

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer YOUR_API_KEY` | Yes |
| `Content-Type` | `application/json` (for JSON) or omit (for Form) | For JSON |

---

## Testing Each Action

### Test Action 5 (API Call):

To test the API call works:

1. Temporarily add **"Show Result"** action after action 5
2. Run the shortcut
3. You should see the JSON response:
   ```json
   {
     "success": true,
     "id": "abc-123-...",
     "message": "Content captured successfully"
   }
   ```

### Test Tag Splitting:

1. Add **"Show Result"** after splitting tags
2. Input: `work, personal, important`
3. Should show a list: `["work", "personal", "important"]`

---

## Quick Reference: Variable Names

Use these exact variable names for consistency:

| Variable | Purpose | Type |
|----------|---------|------|
| `UserAnnotation` | User's annotation input | Text |
| `UserTags` | User's tag input (comma-separated) | Text |
| `Tags` | Processed tag list | List |
| `ContentText` | Extracted text content | Text |
| `FileData` | File/image data | File |
| `Response` | API response | Dictionary |

---

## Screenshots Placeholder

*Note: Screenshots will be added after testing on an actual iOS device.*

Locations for screenshots:
1. Share Sheet configuration
2. Full shortcut action list
3. Example text capture flow
4. Example image capture flow
5. Success notification
6. Error alert

---

## Export & Share

Once your shortcut works:

1. Open the shortcut in Shortcuts app
2. Tap the **share** icon (top right)
3. Choose **"Copy iCloud Link"**
4. Share this link with others

They can click the link to install the shortcut directly.

---

## Version History

**v1.0 (MVP)** - Text-only capture
- ✅ Accept text from share sheet
- ✅ Optional annotation
- ✅ Optional tags
- ✅ Error handling
- ✅ Success notifications

**v2.0 (Future)** - Full media support
- 🔄 Image capture (pending multipart solution)
- 🔄 PDF capture (pending multipart solution)
- 🔄 Batch processing
- 🔄 Offline queue

---

For full setup instructions, see [ios-shortcut-quick-start.md](./ios-shortcut-quick-start.md)
