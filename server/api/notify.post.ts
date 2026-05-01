export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const to: string = body?.to?.trim();
  const totalRows: number = Number(body?.totalRows) || 0;
  const doneRows: number = Number(body?.doneRows) || 0;
  const failedRows: number = Number(body?.failedRows) || 0;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw createError({ statusCode: 400, message: "valid 'to' email is required" });
  }

  const env = (event.context.cloudflare?.env as any) ?? process.env;
  if (!env.RESEND_API_KEY) {
    throw createError({ statusCode: 503, message: "Email is not configured (RESEND_API_KEY missing)" });
  }

  const appUrl = env.APP_BASE_URL ?? "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "Company Analyzer <onboarding@resend.dev>",
      to: [to],
      subject: `Your batch is ready (${doneRows}/${totalRows} succeeded)`,
      html: `
        <p>Your company analysis batch is complete.</p>
        <ul>
          <li><b>${doneRows}</b> of ${totalRows} succeeded</li>
          <li><b>${failedRows}</b> failed</li>
        </ul>
        <p>Open the browser tab where you started the batch and click <b>Download results.xlsx</b>.</p>
        ${appUrl ? `<p><a href="${appUrl}">Go to Company Analyzer</a></p>` : ""}
        <p style="color:#888;font-size:12px">Note: the results live in your browser. If you closed the tab, the results are lost and you'll need to re-run the batch.</p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    console.error("Email send failed:", err);
    throw createError({ statusCode: 502, message: "Email provider rejected the request" });
  }

  return { ok: true };
});
