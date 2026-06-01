import { parseNumber } from "./geo";

export function validateExecutiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const name = String(data.name || data.fullName || data.executive_name || '').trim();
  const title = String(data.title || data.position || data.role || '').trim();

  if (!name || name === 'Unknown' || !title) {
    return null;
  }

  // Filter out placeholder names (titles without real names)
  const placeholderPatterns = ['Managing Director', 'CEO', 'CFO', 'COO', 'CTO', 'Director', 'Manager', 'Founder', 'Owner', 'President', 'Chairman'];
  const isPlaceholder = placeholderPatterns.some(p =>
    name.toLowerCase() === p.toLowerCase() ||
    name.toLowerCase().replace(/\s+/g, '') === p.toLowerCase().replace(/\s+/g, '')
  );
  if (isPlaceholder) {
    console.warn(`[Discovery] Filtering out placeholder executive name: "${name}"`);
    return null;
  }

  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));

  // Only return high-confidence executives (confidence >= 6)
  const MIN_CONFIDENCE = 6;
  if (confidence < MIN_CONFIDENCE) {
    console.warn(`[Discovery] Filtering out low-confidence executive: "${name}" (confidence: ${confidence})`);
    return null;
  }

  return {
    name,
    title,
    email: data.email || null,
    linkedin: data.linkedin || data.linkedIn || null,
    profileUrl: data.profileUrl || data.profile_url || data.linkedin || null,
    imageUrl: data.imageUrl || data.image_url || null,
    source: data.source || 'discovery',
    confidence
  };
}

export function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }

    return null;
  }
}
