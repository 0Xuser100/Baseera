export async function sendBatchCompleteEmail(opts: {
  to: string;
  batchId: string;
  totalRows: number;
  doneRows: number;
  failedRows: number;
  downloadUrl: string;
  env: any;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: opts.env.EMAIL_FROM ?? "Company Analyzer <onboarding@resend.dev>",
      to: [opts.to],
      subject: `Your batch is ready (${opts.doneRows}/${opts.totalRows} succeeded)`,
      html: `
        <p>Your company analysis batch is complete.</p>
        <ul>
          <li>${opts.doneRows} of ${opts.totalRows} succeeded</li>
          <li>${opts.failedRows} failed</li>
        </ul>
        <p><a href="${opts.downloadUrl}">Download results.xlsx</a></p>
        <p>This link is valid for 7 days.</p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    console.error("Email send failed:", err);
  }
}
