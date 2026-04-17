import { supabaseAdmin } from '@/lib/supabase-server';

export const CREATIVE_TOOLS = [
  'generate_image',
  'save_note',
  'generate_chart',
  'generate_prd',
  'generate_presentation',
] as const;

export async function handle(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case 'generate_image': {
        const imgPrompt = input.prompt as string;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return 'Gemini API key not configured.';

        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: imgPrompt }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
              }),
            }
          );

          if (!res.ok) return `Image generation failed (${res.status}). Try a different prompt.`;

          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts ?? [];
          let imageData = '';
          let mimeType = '';
          let text = '';

          for (const part of parts) {
            if (part.text) text += part.text;
            if (part.inlineData) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType || 'image/png';
            }
          }

          if (imageData) {
            const fileName = `${userId}/cerebro-${Date.now()}.png`;
            const buffer = Buffer.from(imageData, 'base64');
            await supabaseAdmin.storage.from('notes').upload(fileName, buffer, { contentType: mimeType });
            const { data: signed } = await supabaseAdmin.storage.from('notes').createSignedUrl(fileName, 31536000);
            const url = signed?.signedUrl;

            await supabaseAdmin.from('generated_images').insert({
              user_id: userId,
              prompt: imgPrompt,
              storage_path: fileName,
              provider: 'gemini',
              source: 'cerebro',
            });

            return `IMAGE_GENERATED:${url}\n\n${text || `Image generated for: "${imgPrompt}"`}`;
          }

          return text || 'Image generation completed but no image was returned. Try a more descriptive prompt.';
        } catch (err) {
          return `Image generation error: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      }

      case 'save_note': {
        const noteId = input.note_id as string;
        if (noteId) {
          await supabaseAdmin.from('notes_v2').update({
            title: input.title as string,
            content: input.content as string,
          }).eq('id', noteId).eq('user_id', userId);
          return `Note updated: "${input.title}"`;
        } else {
          const { data, error } = await supabaseAdmin.from('notes_v2').insert({
            user_id: userId,
            title: input.title as string,
            content: input.content as string,
          }).select('id, title').single();
          if (error) return `Error: ${error.message}`;
          return `Note created: "${data.title}" (ID: ${data.id})`;
        }
      }

      case 'generate_chart': {
        const chartType = input.type as string;
        const title = input.title as string;
        const labels = input.labels as string[];
        const values = input.values as number[];
        const colors = (input.colors as string[] | undefined) || labels.map((_, i) => {
          const palette = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7'];
          return palette[i % palette.length];
        });

        const maxVal = Math.max(...values, 1);
        const W = 600, H = 400, pad = 60;

        let body = '';
        if (chartType === 'bar') {
          const barW = Math.min(50, (W - pad * 2) / labels.length - 8);
          body = labels.map((label, i) => {
            const barH = ((values[i] / maxVal) * (H - pad * 2));
            const x = pad + i * ((W - pad * 2) / labels.length) + ((W - pad * 2) / labels.length - barW) / 2;
            const y = H - pad - barH;
            return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${colors[i]}" rx="4"/>` +
              `<text x="${x + barW / 2}" y="${H - pad + 16}" text-anchor="middle" fill="#94a3b8" font-size="11">${label}</text>` +
              `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="600">${values[i]}</text>`;
          }).join('');
        } else if (chartType === 'pie') {
          const total = values.reduce((a, b) => a + b, 0) || 1;
          const cx = W / 2, cy = H / 2 - 10, r = 140;
          let cumAngle = -Math.PI / 2;
          body = values.map((v, i) => {
            const angle = (v / total) * Math.PI * 2;
            const x1 = cx + r * Math.cos(cumAngle);
            const y1 = cy + r * Math.sin(cumAngle);
            cumAngle += angle;
            const x2 = cx + r * Math.cos(cumAngle);
            const y2 = cy + r * Math.sin(cumAngle);
            const large = angle > Math.PI ? 1 : 0;
            const midAngle = cumAngle - angle / 2;
            const lx = cx + (r + 20) * Math.cos(midAngle);
            const ly = cy + (r + 20) * Math.sin(midAngle);
            return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${colors[i]}"/>` +
              `<text x="${lx}" y="${ly}" text-anchor="middle" fill="#e2e8f0" font-size="11">${labels[i]} (${Math.round(v / total * 100)}%)</text>`;
          }).join('');
        } else {
          const stepX = (W - pad * 2) / Math.max(labels.length - 1, 1);
          const points = values.map((v, i) => {
            const x = pad + i * stepX;
            const y = H - pad - (v / maxVal) * (H - pad * 2);
            return `${x},${y}`;
          });
          body = `<polyline points="${points.join(' ')}" fill="none" stroke="${colors[0]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
            points.map((p, i) => {
              const [x, y] = p.split(',');
              return `<circle cx="${x}" cy="${y}" r="4" fill="${colors[0]}"/>` +
                `<text x="${x}" y="${Number(y) - 10}" text-anchor="middle" fill="#e2e8f0" font-size="11">${values[i]}</text>` +
                `<text x="${x}" y="${H - pad + 16}" text-anchor="middle" fill="#94a3b8" font-size="11">${labels[i]}</text>`;
            }).join('');
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
          `<rect width="${W}" height="${H}" fill="#0f172a" rx="12"/>` +
          `<text x="${W / 2}" y="30" text-anchor="middle" fill="#f1f5f9" font-size="16" font-weight="700">${title}</text>` +
          body + `</svg>`;

        return `CHART_SVG:${svg}`;
      }

      case 'generate_prd': {
        const title = input.title as string;
        const overview = input.overview as string;
        const requirements = input.requirements as string[];
        const nonFunc = (input.non_functional as string[]) || [];
        const milestones = (input.milestones as string[]) || [];

        const md = `# PRD: ${title}\n\n` +
          `## Overview\n${overview}\n\n` +
          `## Functional Requirements\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
          (nonFunc.length ? `## Non-Functional Requirements\n${nonFunc.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` : '') +
          (milestones.length ? `## Milestones\n${milestones.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n` : '') +
          `---\n*Generated by Cerebro on ${new Date().toLocaleDateString('en-ZA')}*`;

        await supabaseAdmin.from('knowledge_base').insert({
          user_id: userId,
          title: `PRD: ${title}`,
          content: md,
          category: 'PRD',
          tags: ['prd', 'cerebro'],
        });

        return `PRD saved to Knowledge Base:\n\n${md}`;
      }

      case 'generate_presentation': {
        const title = input.title as string;
        const audience = (input.audience as string) || 'General';
        const slides = input.slides as Array<{ heading: string; bullets: string[] }>;

        const md = `# ${title}\n*Audience: ${audience}*\n\n` +
          slides.map((s, i) => {
            const bullets = s.bullets.map(b => `- ${b}`).join('\n');
            return `---\n## Slide ${i + 1}: ${s.heading}\n${bullets}`;
          }).join('\n\n') +
          `\n\n---\n*Generated by Cerebro on ${new Date().toLocaleDateString('en-ZA')}*`;

        await supabaseAdmin.from('knowledge_base').insert({
          user_id: userId,
          title: `Deck: ${title}`,
          content: md,
          category: 'Presentation',
          tags: ['presentation', 'cerebro'],
        });

        return `Presentation outline saved to Knowledge Base:\n\n${md}`;
      }

      default:
        return `Unknown tool in creative director: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
