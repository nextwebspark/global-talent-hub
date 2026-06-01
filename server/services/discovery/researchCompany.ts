import { getLLMClient } from "../llmClient";
import { DEFAULT_MODEL } from "./models";
import { extractJSON } from "./validate";
import { validateCompanyData } from "./normalize";

export async function researchCompanyDetails(companyName: string, selectedModel: string = DEFAULT_MODEL): Promise<any> {
  console.log(`[Discovery] Researching company details for: ${companyName}`);

  const client = await getLLMClient();
  const modelName = selectedModel || DEFAULT_MODEL;

  const messages = [
    {
      role: "system" as const,
      content: `You are a company research expert. Given a company name, find accurate details about the company including:
- Exact headquarters location (street address, city, country, GPS coordinates)
- Estimated annual revenue in USD
- Estimated employee count
- Primary industry/sector
- Business type (manufacturer, distributor, retailer, service_provider, etc.)

Return ONLY a JSON object with this structure:
{
  "name": "Official Company Name",
  "sector": "Industry Sector",
  "businessType": "distributor|retailer|manufacturer|wholesaler|service_provider",
  "region": "Geographic Region",
  "country": "Country",
  "city": "Headquarters City",
  "streetAddress": "123 Main Street",
  "latitude": 25.2048,
  "longitude": 55.2708,
  "revenue": 500000000,
  "revenueSource": "Source of revenue estimate",
  "employees": 1000,
  "employeesSource": "Source of employee count"
}`
    },
    {
      role: "user" as const,
      content: `Research and provide details for this company: "${companyName}"`
    }
  ];

  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages,
      max_tokens: 1000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || "{}";
    const data = extractJSON(content);

    if (data) {
      return validateCompanyData(data);
    }

    return null;
  } catch (error: any) {
    console.error("[Discovery] Company research error:", error.message);
    return null;
  }
}
