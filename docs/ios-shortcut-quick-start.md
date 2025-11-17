# iOS Shortcut Quick Start - Kura Notes

A simplified guide to create the "Save to Kura" shortcut in 10 minutes.

## Before You Begin

You need:
1. Your Kura Notes server URL (e.g., `http://192.168.1.100:3000`)
2. Your API key (from your `.env` file)

---

## Step-by-Step Instructions

### Part 1: Create the Shortcut (2 minutes)

1. Open **Shortcuts** app on your iPhone/iPad
2. Tap **+** (top right)
3. Tap the shortcut name, rename to **"Save to Kura"**
4. Tap **ⓘ** (info icon, bottom right)
5. Toggle **ON**: "Show in Share Sheet"
6. Under "Share Sheet Types", enable:
   - ✅ Text
   - ✅ Images
   - ✅ Files
7. Tap **Done**

### Part 2: Add Basic Logic (8 minutes)

Follow these actions in order. Tap "Add Action" before each one.

#### Actions to Add:

**1. Ask for Input**
- Prompt: `Add annotation (optional)`
- Type: Text
- Allow Multiple Lines: ON

**2. Set Variable**
- Variable Name: `UserAnnotation`
- Value: `Provided Input`

**3. Ask for Input**
- Prompt: `Add tags (comma-separated)`
- Type: Text

**4. Set Variable**
- Variable Name: `UserTags`
- Value: `Provided Input`

**5. If** (condition)
- If: `Shortcut Input`
- Condition: `has any value`

**6. Get Type** (inside If)
- Get type of: `Shortcut Input`

**7. If** (nested condition)
- If: `Type`
- Condition: `is`
- Value: `Text`

#### For Text Content (inside nested If):

**8. Get Text from Input**
- From: `Shortcut Input`

**9. Set Variable**
- Variable Name: `TextContent`
- Value: `Text from Shortcut Input`

**10. Get Contents of URL**
- URL: `http://YOUR_SERVER:3000/api/capture` (⚠️ CHANGE THIS)
- Method: `POST`
- Headers:
  - `Authorization`: `Bearer YOUR_API_KEY` (⚠️ CHANGE THIS)
  - `Content-Type`: `application/json`
- Request Body: `JSON`
- JSON:
  ```
  {
    "content": TextContent,
    "annotation": UserAnnotation,
    "tags": UserTags (split by ",")
  }
  ```

**11. Otherwise If**
- If: `Type`
- Condition: `is any of`
- Values: `Image`, `File`

#### For Files/Images (inside Otherwise If):

**12. Get Contents of URL**
- URL: `http://YOUR_SERVER:3000/api/capture` (⚠️ CHANGE THIS)
- Method: `POST`
- Headers:
  - `Authorization`: `Bearer YOUR_API_KEY` (⚠️ CHANGE THIS)
- Request Body: `Form`
- Form fields:
  - `file`: `Shortcut Input`
  - `metadata`: `{"annotation": "UserAnnotation", "tags": ["tag1","tag2"]}`

⚠️ **Note:** Building the metadata JSON for multipart is tricky in Shortcuts. See "Alternative Simple Version" below.

**13. End If** (closes the nested If for text vs files)

**14. Get Dictionary Value**
- Get value for: `success`
- from: `Contents of URL`

**15. If**
- If: `Dictionary Value`
- Condition: `is`
- Value: `true`

**16. Show Notification**
- Title: `Saved to Kura!`
- Body: `Content captured successfully`

**17. Otherwise**

**18. Show Alert**
- Alert: `Failed to save content`

**19. End If** (closes success check)

**20. End If** (closes the outer If)

---

## Alternative: Simplified Version (Text Only)

If you only want to capture **text** (simplest approach):

### Actions:

1. **Ask for Input**
   - Prompt: `Annotation (optional)`

2. **Get Contents of URL**
   - URL: `http://192.168.1.100:3000/api/capture`
   - Method: `POST`
   - Headers:
     - `Authorization`: `Bearer your-api-key-here`
     - `Content-Type`: `application/json`
   - Request Body: `JSON`
   - JSON:
     ```json
     {
       "content": Shortcut Input,
       "annotation": Provided Input
     }
     ```

3. **Show Notification**
   - Title: `Saved!`
   - Body: `Saved to Kura Notes`

That's it! 3 actions for text-only capture.

---

## Configuration Checklist

Before testing, update these values:

- [ ] **Server URL**: Change `http://YOUR_SERVER:3000` to your actual server address
- [ ] **API Key**: Change `YOUR_API_KEY` to your actual API key
- [ ] **Test Connection**: Try opening your server URL in Safari to verify it's accessible

---

## Testing

### Test Text Capture:
1. Open **Safari**
2. Go to any webpage
3. Select some text
4. Tap **Share** → **Save to Kura**
5. Enter annotation and tags
6. Check Kura Notes web interface

### Test Image Capture:
1. Open **Photos** app
2. Select a photo
3. Tap **Share** → **Save to Kura**
4. Enter annotation and tags
5. Check Kura Notes web interface

---

## Common Issues

### "The operation couldn't be completed"
- **Fix:** Check your server URL is correct and accessible
- **Test:** Open the URL in Safari first

### "401 Unauthorized"
- **Fix:** Check your API key is correct
- **Test:** Verify the API key in your `.env` file matches

### "Connection failed"
- **Fix:** Ensure your iPhone is on the same network as your server
- **Test:** Ping the server IP from your network

### Shortcut doesn't appear in share sheet
- **Fix:** Open the shortcut, tap ⓘ, verify "Show in Share Sheet" is ON
- **Test:** Check the correct input types are enabled (Text, Images, Files)

---

## What Gets Captured?

| Source | What's Captured |
|--------|-----------------|
| **Safari - Selected Text** | The selected text |
| **Safari - Share Page** | Page URL and title |
| **Photos** | The image file |
| **Files** | The file (PDF, etc.) |
| **Notes** | Selected text |
| **Any app with text selection** | Selected text |

---

## Next Steps

Once your shortcut works:

1. **Customize prompts**: Remove annotation/tags if you don't need them
2. **Add to Home Screen**: Add the shortcut to your home screen for quick access
3. **Siri Integration**: Say "Hey Siri, Save to Kura" to run it
4. **Share with Family**: Export as iCloud link to share with others

---

## Advanced Tips

### Skip Prompts for Quick Capture

Remove the "Ask for Input" actions and the shortcut will capture instantly without prompts.

### Auto-Tag by Type

Add logic to automatically tag:
- Images → tag: `image`
- PDFs → tag: `document`
- Web pages → tag: `web`

### Add Timestamp to Annotation

Use the "Current Date" action to add a timestamp to every annotation.

---

## Full Documentation

For complete details, see [ios-shortcut-setup.md](./ios-shortcut-setup.md)
