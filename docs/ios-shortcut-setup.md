# iOS Shortcut Setup Guide for Kura Notes

This guide will help you create an iOS Shortcut to capture content (text, images, PDFs) from any app's share sheet directly to your Kura Notes instance.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup Instructions](#detailed-setup-instructions)
- [Configuration Options](#configuration-options)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Advanced Customization](#advanced-customization)

---

## Prerequisites

Before you begin, ensure you have:

1. **iOS Device** running iOS 13 or later (iOS 15+ recommended)
2. **Kura Notes Server** running and accessible from your iOS device
3. **API Key** from your Kura Notes instance (found in your `.env` file as `API_KEY`)
4. **Server URL** where your Kura Notes instance is running (e.g., `http://192.168.1.100:3000` for local network)

---

## Quick Start

### Option 1: Import Pre-Built Shortcut (Coming Soon)

*Note: Once the shortcut is finalized, an iCloud link will be provided here for easy installation.*

### Option 2: Build It Yourself (Recommended for Now)

Follow the [Detailed Setup Instructions](#detailed-setup-instructions) below.

---

## Detailed Setup Instructions

### Step 1: Open Shortcuts App

1. Open the **Shortcuts** app on your iOS device
2. Tap the **+** button in the top right corner to create a new shortcut

### Step 2: Configure Shortcut to Receive Input

1. Tap on the shortcut name at the top (default: "New Shortcut") and rename it to **"Save to Kura"**
2. Tap the **ⓘ** (info) icon in the bottom right
3. Enable **"Show in Share Sheet"**
4. Under "Share Sheet Types", select:
   - **Text**
   - **Images**
   - **Files**
5. Tap **Done**

### Step 3: Build the Shortcut Logic

Now we'll add actions to handle the content. Follow these steps carefully:

#### 3.1: Get Input Type

1. Tap **"Add Action"**
2. Search for **"Get Type"** and select it
3. This will show: **Get type of Shortcut Input**

#### 3.2: Conditional Logic for Different Input Types

We'll handle text, images, and PDFs differently:

##### Handle Text Input

1. Add action: **"If"**
2. Set condition to: **Type** is **Text**
3. Inside the If block, add:
   - **"Get Text from Input"** → This extracts the text
   - **"Set Variable"** → Name it `ContentText`
   - **"Set Variable"** → Name it `ContentType`, set value to `text`
   - **"Set Variable"** → Name it `IsFile`, set value to `No` (or `false`)

##### Handle Image Input

1. After the If, add: **"Otherwise If"**
2. Set condition to: **Type** is **Image**
3. Inside this block, add:
   - **"Base64 Encode"** → Select `Shortcut Input`
   - **"Set Variable"** → Name it `FileData`
   - **"Get Name of Input"** → To get the filename
   - **"Set Variable"** → Name it `FileName`
   - **"Set Variable"** → Name it `ContentType`, set value to `image`
   - **"Set Variable"** → Name it `IsFile`, set value to `Yes`

##### Handle PDF Input

1. After the Otherwise If, add another: **"Otherwise If"**
2. Set condition to: **Type** is **File**
3. Inside this block, add:
   - **"Base64 Encode"** → Select `Shortcut Input`
   - **"Set Variable"** → Name it `FileData`
   - **"Get Name of Input"** → To get the filename
   - **"Set Variable"** → Name it `FileName`
   - **"Set Variable"** → Name it `ContentType`, set value to `pdf`
   - **"Set Variable"** → Name it `IsFile`, set value to `Yes`

##### Handle Unsupported Types

1. After the last Otherwise If, add: **"Otherwise"**
2. Inside this block, add:
   - **"Show Alert"** with message: `Unsupported content type. Please share text, images, or PDF files.`
   - **"Stop and Output"**

4. Close the If statement with **"End If"**

#### 3.3: Optional User Prompts

Add these actions after the If/End If block:

1. **"Ask for Input"**
   - Prompt: `Annotation (optional)`
   - Input Type: Text
   - Allow Multiple Lines: Yes
   - Default Answer: (leave blank)
2. **"Set Variable"** → Name it `Annotation`, set to `Provided Input`

3. **"Ask for Input"**
   - Prompt: `Tags (comma-separated, optional)`
   - Input Type: Text
   - Default Answer: (leave blank)
4. **"Set Variable"** → Name it `TagsInput`

#### 3.4: Process Tags

1. Add **"If"** → Condition: `TagsInput` is not empty
2. Inside the If:
   - **"Split Text"** → Split `TagsInput` by `,` (comma)
   - **"Repeat with Each"** (item in split text)
     - **"Get Text from Input"** → Get the item
     - **"Replace Text"** → Replace `^\s+|\s+$` (regex) with `` (empty) [This trims whitespace]
     - **"Add to Variable"** → Add to `Tags` (this will create a list)
   - **"End Repeat"**
3. **"End If"**

#### 3.5: Build the API Request

Now we'll send the data to your Kura Notes server:

##### For Text Content:

1. Add **"If"** → Condition: `IsFile` is `No`
2. Inside the If, add **"Get Contents of URL"**
   - URL: `http://YOUR_SERVER_IP:3000/api/capture` *(replace with your actual server URL)*
   - Method: **POST**
   - Headers:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer YOUR_API_KEY` *(replace with your actual API key)*
   - Request Body: **JSON**
   - JSON Structure:
     ```
     {
       "content": [ContentText variable],
       "annotation": [Annotation variable],
       "tags": [Tags variable]
     }
     ```

##### For File Content (Images/PDFs):

3. After the If, add **"Otherwise"**
4. Inside Otherwise, we need to build multipart/form-data manually:

   *Note: iOS Shortcuts has limited multipart support. The easiest approach is to send files as base64 in JSON:*

   Add **"Get Contents of URL"**
   - URL: `http://YOUR_SERVER_IP:3000/api/capture`
   - Method: **POST**
   - Headers:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer YOUR_API_KEY`
   - Request Body: **JSON**
   - JSON Structure:
     ```
     {
       "content": [FileData variable],
       "contentType": [ContentType variable],
       "filename": [FileName variable],
       "annotation": [Annotation variable],
       "tags": [Tags variable]
     }
     ```

   *IMPORTANT: This requires a server modification to accept base64-encoded files in JSON. See [Alternative Approach](#alternative-approach-multipart-form-data) below.*

5. **"End If"**

#### 3.6: Handle API Response

1. Add **"Set Variable"** → Name it `Response`, set to `Contents of URL`
2. Add **"Get Dictionary Value"**
   - Key: `success`
   - Dictionary: `Response`
3. Add **"If"** → Condition: `Dictionary Value` is `true`
4. Inside If:
   - **"Show Notification"**
     - Title: `Saved to Kura Notes`
     - Body: `Content captured successfully!`
5. **"Otherwise"**
6. Inside Otherwise:
   - **"Get Dictionary Value"**
     - Key: `message`
     - Dictionary: `Response`
   - **"Show Alert"**
     - Message: `Failed to save: [Dictionary Value]`
7. **"End If"**

### Step 4: Test the Shortcut

1. Open Safari and go to any webpage
2. Tap the **Share** button
3. Scroll down and tap **"Save to Kura"**
4. Follow the prompts
5. Check your Kura Notes instance to verify the content was saved

---

## Configuration Options

### Required Configuration

Before using the shortcut, you MUST configure these values in Step 3.5:

| Setting | Example | Description |
|---------|---------|-------------|
| **Server URL** | `http://192.168.1.100:3000` | Your Kura Notes server address |
| **API Key** | `your-secret-api-key-here` | Found in `.env` as `API_KEY` |

### Optional Configuration

You can customize these aspects:

| Setting | Default | Description |
|---------|---------|-------------|
| **Annotation Prompt** | Enabled | Set to skip if you don't want to annotate every capture |
| **Tags Prompt** | Enabled | Set to skip if you don't want to tag content |
| **Notification** | Enabled | Show confirmation after successful save |

### Skipping Prompts

To disable annotation/tags prompts:
1. Find the "Ask for Input" actions
2. Delete them
3. Set the corresponding variables to empty text instead

---

## Usage Guide

### Capturing Text

1. **From Safari:**
   - Select text on a webpage
   - Tap **Share** → **"Save to Kura"**
   - Or share the entire page (URL will be captured)

2. **From Notes/Email:**
   - Select text
   - Tap **Share** → **"Save to Kura"**

3. **From Clipboard:**
   - Copy text
   - Open Shortcuts app
   - Tap **"Save to Kura"** and paste

### Capturing Images

1. **From Photos:**
   - Select a photo
   - Tap **Share** → **"Save to Kura"**

2. **From Screenshot:**
   - Take a screenshot
   - Tap the thumbnail
   - Tap **Share** → **"Save to Kura"**

3. **From Safari:**
   - Long-press an image
   - Tap **Share Image** → **"Save to Kura"**

### Capturing PDFs

1. **From Files:**
   - Select a PDF file
   - Tap **Share** → **"Save to Kura"**

2. **From Safari:**
   - Open a PDF in Safari
   - Tap **Share** → **"Save to Kura"**

---

## Troubleshooting

### Common Issues

#### "Could not connect to server"

**Causes:**
- Server is not running
- Wrong IP address/port
- iOS device not on same network (for local servers)

**Solutions:**
1. Check server is running: `docker-compose ps`
2. Verify server URL in shortcut matches your setup
3. For local network: ensure iOS device is on same WiFi
4. Try accessing server URL in Safari first

#### "Unauthorized" or "Invalid API Key"

**Causes:**
- API key is incorrect
- API key not configured in shortcut
- Authorization header format incorrect

**Solutions:**
1. Check `.env` file for correct `API_KEY`
2. Verify Authorization header is: `Bearer YOUR_API_KEY`
3. Ensure no extra spaces in the API key

#### "Unsupported content type"

**Causes:**
- Sharing a file type not supported (video, audio, etc.)
- Content type detection failed

**Solutions:**
1. Only share: text, images (JPEG/PNG), or PDFs
2. Check the file extension

#### Nothing happens / Shortcut doesn't appear

**Causes:**
- Share Sheet not enabled for correct types
- Shortcut not configured properly

**Solutions:**
1. Open Shortcuts app → Your shortcut → ⓘ icon
2. Verify "Show in Share Sheet" is enabled
3. Verify correct types are selected

### Debugging

To see what's happening:

1. Add **"Show Notification"** actions after each major step
2. Add **"Show Result"** to see variable values
3. Check the Shortcuts app logs (Settings → Shortcuts → Advanced → Show Debug Logs)

---

## Alternative Approach: Multipart Form Data

The approach above sends base64-encoded files in JSON for simplicity. For better compatibility with the existing API, you can use multipart/form-data:

### Modified Server Code (Required)

The current server expects multipart requests for files. To use the simplified JSON approach above, you would need to modify `/src/api/routes/capture.ts` to accept base64-encoded files in JSON.

### Multipart Approach in iOS Shortcuts

Unfortunately, iOS Shortcuts has limited built-in support for multipart/form-data. The recommended approach is:

1. Use a third-party app like **Toolbox Pro** (paid) which has better HTTP support
2. Or use the **Scriptable** app with JavaScript to build proper multipart requests
3. Or modify the server to accept base64 JSON (simpler for MVP)

For now, the JSON approach is recommended for simplicity.

---

## Advanced Customization

### Auto-Tagging Based on Source

You can automatically add tags based on where content comes from:

1. Add **"Get Details of Safari Web Page"** to check if coming from Safari
2. Add **"Get Name of Input"** for files
3. Use **"If"** conditions to set different tags:
   - If from Safari → add tag `web`
   - If image → add tag `image`
   - If PDF → add tag `document`

### Auto-Annotation with Context

Add automatic context to annotations:

1. Get current date/time: **"Current Date"**
2. Get location (if enabled): **"Get Current Location"**
3. Build annotation text: **"Text"** → `Captured on [date] at [location]`

### Batch Capture

To capture multiple items at once:

1. Enable accepting multiple files in Share Sheet settings
2. Add **"Repeat with Each"** loop for Shortcut Input
3. Process each item individually

---

## Server Configuration Notes

### API Endpoint Reference

**Endpoint:** `POST /api/capture`

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json (for text) OR multipart/form-data (for files)
```

**Request Body (Text):**
```json
{
  "content": "The text content to save",
  "title": "Optional title",
  "annotation": "Optional annotation/context",
  "tags": ["tag1", "tag2"]
}
```

**Request Body (Files - Multipart):**
```
file: [binary file data]
metadata: {
  "title": "Optional title",
  "annotation": "Optional annotation",
  "tags": ["tag1", "tag2"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Content captured successfully",
  "timestamp": "2025-11-17T10:30:00.000Z"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message here",
  "statusCode": 400
}
```

### For Production Use

When deploying to production:

1. **Use HTTPS:** Replace `http://` with `https://` in server URL
2. **Use Domain Name:** Replace IP with domain (e.g., `https://kura.example.com`)
3. **Rotate API Keys:** Generate secure API keys (use `openssl rand -hex 32`)
4. **Rate Limiting:** Consider adding rate limiting for mobile captures

---

## Security Considerations

### API Key Protection

Your API key is stored in the shortcut in **plain text**. Anyone with access to your iOS device can see it.

**Recommendations:**
1. Use a unique API key just for mobile (different from your main key)
2. Consider implementing key rotation
3. Use iOS device passcode/biometric lock
4. For sensitive data, consider end-to-end encryption (future feature)

### Network Security

For local network usage:
- Ensure your WiFi network is secured with WPA2/WPA3
- Consider VPN for remote access instead of exposing server to internet
- Use HTTPS in production

### Data Privacy

- All content is stored on YOUR server
- No third-party services involved
- iOS Shortcuts runs locally on device

---

## Support & Feedback

### Getting Help

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review server logs: `docker-compose logs -f api`
3. Enable debug logs in Shortcuts app
4. Check GitHub issues for known problems

### Reporting Issues

When reporting issues, include:
- iOS version
- Shortcut configuration (screenshot)
- Error message (screenshot)
- Server logs (relevant parts)

---

## Changelog

**Version 1.0** (2025-11-17)
- Initial release
- Support for text, images, and PDFs
- Optional annotation and tags
- Error handling and notifications

---

## What's Next?

Future improvements planned:
- **iCloud Link:** Pre-built shortcut for easy installation
- **OCR Support:** Extract text from images automatically
- **Voice Memos:** Capture audio and transcribe
- **Quick Capture Widget:** iOS home screen widget
- **Siri Integration:** "Hey Siri, save this to Kura"

---

## License

This shortcut is part of the Kura Notes project. Use freely for personal use.
