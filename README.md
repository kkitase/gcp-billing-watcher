# Google Cloud Billing Watcher

[日本語の説明はこちら (README_ja.md)](https://github.com/kkitase/gcp-billing-watcher/blob/main/README_ja.md)

A VS Code extension that displays your Google Cloud billing status (current month, annual total, etc.) in real-time right in the status bar.

![Screenshot](assets/screenshot.png)

## Quick Start

If you installed this from the Marketplace, follow these 3 simple steps to get started:

### Step 1: Enable Billing Export in Google Cloud Console

1. Go to the [Billing Export page](https://console.cloud.google.com/billing/export).
2. Select your **Billing Account**.
3. Under the **"Standard usage cost"** section, click **"Edit Settings"**.
4. Select a **Project** and a **Dataset** (e.g., `billing_export`) to export data to, and save.
   - *Note: If you don't have a dataset yet, create one in the BigQuery console first.*

> 📝 **Important**: It may take **24 to 48 hours** for the first set of data to appear after enabling export.

### Step 2: Authentication (gcloud SDK)

The extension needs access to your Google Cloud resources. Ensure the `gcloud` CLI is installed and authenticated:

```bash
# 1. Login to gcloud
gcloud auth login

# 2. Setup Application Default Credentials (Required)
gcloud auth application-default login

# 3. Set your active project
gcloud config set project <your-project-id>
```

### Step 3: Configure Projects in VS Code

Add one or more projects to `gcpBilling.projects` in your `settings.json`:

```jsonc
{
  "gcpBilling.projects": [
    {
      "projectId": "your-project-id",
      "datasetId": "billing_export",
      "label": "Main"
    }
  ]
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `projectId` | ✅ | - | GCP project ID where billing is exported. |
| `datasetId` | | `billing_export` | BigQuery dataset name. |
| `credentialsPath` | | (uses ADC) | Path to a service account JSON key file. |
| `label` | | `projectId` | Display name shown in the tooltip breakdown. |

If the extension launches with no project configured, a warning will appear with a "Set up" button that opens a project picker (powered by `gcloud projects list`).

---

## Key Features

- 📊 **Status Bar Display**: See your current month's spending and annual total at a glance.
- 💡 **Detailed Tooltip**: Hover over the status bar to see last month's spending and a 3-month history.
- 💰 **Budget Alerts**: Set a monthly budget to change status bar colors based on usage.
- 🌐 **Multi-language Support**: Supports English and Japanese. Can be forced in settings.

---

## Troubleshooting

### Displaying "Google Cloud: Error"
- Ensure "Billing Export" is correctly configured in the Google Cloud console.
- Verify `gcloud auth application-default login` has been executed.
- If you just enabled export, data might be empty. Please wait up to 24-48 hours.

### "unable to get issuer certificate" (Proxy environment)
- If you are behind a corporate proxy and encounter SSL errors, enable `gcpBilling.skipSslVerification` in settings. *Note: Use at your own risk.*

### Stuck at $0.00
- This is normal for new exports. It takes time for Google Cloud to populate the BigQuery tables.

### Difference between Google Cloud Console and this extension
- **Latency**: BigQuery exports occur multiple times a day, but there is a **latency of several hours up to 24 hours**. Values for "today" or "yesterday" may be lower than the real-time values in the Google Cloud Console.
- **Activation Date**: Data only exists in BigQuery **from the date you enabled the export**. Total costs for the current month will be lower if the export was enabled mid-month.
- **Aggregated Cost**: The extension displays the **sum of all projects** found in the specified BigQuery table. If some projects are missing, verify that they are linked to the same billing account and that data has been exported.

---

## For Developers

### Setup Script
If you've cloned the repository, you can use `setup.sh` to automate dataset creation and deployment:
```bash
./setup.sh <project-id>
```

### Manual Installation
Download the `.vsix` file from [GitHub Releases](https://github.com/kkitase/gcp-billing-watcher/releases) and use "Extensions: Install from VSIX...".

### Building from Source
```bash
git clone https://github.com/kkitase/gcp-billing-watcher.git
npm install
npm run compile
```

---

## License

MIT
