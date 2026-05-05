/**
 * EcomAudit — Backend API
 *
 * Generates automated website audits using:
 * - Google PageSpeed Insights API (free)
 * - Mozilla Observatory API (free)
 * - Direct HTML analysis
 * - Claude API for recommendations
 *
 * Deploy on: Vercel, Railway, or any Node.js host
 */

const fetch = require('node-fetch');

// ============================================
// 1. DATA COLLECTORS (all free APIs)
// ============================================

/**
 * Google PageSpeed Insights — Performance & SEO data
 * Free: 25,000 requests/day
 */
async function getPageSpeedData(url, strategy = 'mobile') {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.error) {
      console.error('PageSpeed error:', data.error.message);
      return null;
    }

    const lighthouse = data.lighthouseResult;
    const categories = lighthouse.categories;
    const audits = lighthouse.audits;

    return {
      scores: {
        performance: Math.round((categories.performance?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories['best-practices']?.score || 0) * 100)
      },
      metrics: {
        lcp: {
          value: audits['largest-contentful-paint']?.displayValue || 'N/A',
          score: audits['largest-contentful-paint']?.score || 0,
          numericValue: audits['largest-contentful-paint']?.numericValue || 0
        },
        fcp: {
          value: audits['first-contentful-paint']?.displayValue || 'N/A',
          score: audits['first-contentful-paint']?.score || 0,
          numericValue: audits['first-contentful-paint']?.numericValue || 0
        },
        cls: {
          value: audits['cumulative-layout-shift']?.displayValue || 'N/A',
          score: audits['cumulative-layout-shift']?.score || 0,
          numericValue: audits['cumulative-layout-shift']?.numericValue || 0
        },
        tbt: {
          value: audits['total-blocking-time']?.displayValue || 'N/A',
          score: audits['total-blocking-time']?.score || 0,
          numericValue: audits['total-blocking-time']?.numericValue || 0
        },
        speedIndex: {
          value: audits['speed-index']?.displayValue || 'N/A',
          score: audits['speed-index']?.score || 0,
          numericValue: audits['speed-index']?.numericValue || 0
        },
        ttfb: {
          value: audits['server-response-time']?.displayValue || 'N/A',
          numericValue: audits['server-response-time']?.numericValue || 0
        },
        interactive: {
          value: audits['interactive']?.displayValue || 'N/A',
          numericValue: audits['interactive']?.numericValue || 0
        }
      },
      opportunities: (lighthouse.audits ? Object.values(lighthouse.audits)
        .filter(a => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
        .map(a => ({
          title: a.title,
          description: a.description,
          savings: a.details?.overallSavingsMs ? `${Math.round(a.details.overallSavingsMs)}ms` : null,
          bytesSaved: a.details?.overallSavingsBytes ? `${Math.round(a.details.overallSavingsBytes / 1024)}KB` : null
        }))
        .slice(0, 10) : []),
      diagnostics: (lighthouse.audits ? Object.values(lighthouse.audits)
        .filter(a => a.details?.type === 'table' && a.score !== null && a.score < 1)
        .map(a => ({
          title: a.title,
          description: a.description
        }))
        .slice(0, 8) : []),
      seoAudits: {
        metaDescription: audits['meta-description']?.score === 1,
        httpStatusCode: audits['http-status-code']?.score === 1,
        isIndexable: audits['is-crawlable']?.score === 1,
        robotsTxt: audits['robots-txt']?.score === 1,
        hreflang: audits['hreflang']?.score === 1,
        canonical: audits['canonical']?.score === 1,
        fontSize: audits['font-size']?.score === 1,
        linkText: audits['link-text']?.score === 1,
        isCrawlable: audits['is-crawlable']?.score === 1,
        tapTargets: audits['tap-targets']?.score === 1,
        viewport: audits['viewport']?.score === 1
      },
      pageWeight: {
        total: lighthouse.audits['total-byte-weight']?.numericValue || 0,
        totalFormatted: lighthouse.audits['total-byte-weight']?.displayValue || 'N/A'
      },
      resourceCounts: lighthouse.audits['resource-summary']?.details?.items || []
    };
  } catch (err) {
    console.error('PageSpeed fetch error:', err);
    return null;
  }
}

/**
 * Security Headers Check — via direct fetch
 * Completely free, no API key needed
 */
async function getSecurityHeaders(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      timeout: 10000
    });

    const headers = {};
    res.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });

    const securityChecks = {
      https: url.startsWith('https://') || res.url.startsWith('https://'),
      hsts: !!headers['strict-transport-security'],
      csp: !!headers['content-security-policy'],
      xContentType: !!headers['x-content-type-options'],
      xFrame: !!headers['x-frame-options'],
      referrerPolicy: !!headers['referrer-policy'],
      permissionsPolicy: !!headers['permissions-policy'],
      xXssProtection: !!headers['x-xss-protection']
    };

    const presentHeaders = Object.entries(securityChecks)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    const missingHeaders = Object.entries(securityChecks)
      .filter(([_, v]) => !v)
      .map(([k]) => k);

    const score = Math.round((presentHeaders.length / Object.keys(securityChecks).length) * 100);

    return {
      score,
      checks: securityChecks,
      present: presentHeaders,
      missing: missingHeaders,
      allHeaders: headers
    };
  } catch (err) {
    console.error('Security headers error:', err);
    return null;
  }
}

/**
 * HTML Head Analysis — Direct fetch and parse
 * Free: we just fetch the page HTML
 */
async function getHtmlAnalysis(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EcomAudit/1.0; +https://ecomaudit.shop)'
      },
      timeout: 15000
    });

    const html = await res.text();

    // Extract head section
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headHtml = headMatch ? headMatch[1] : '';
    const bodyHtml = html;

    // Title
    const titleMatch = headHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Meta description
    const descMatch = headHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)
      || headHtml.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']description["']/i);
    const metaDescription = descMatch ? descMatch[1].trim() : null;

    // Canonical
    const canonicalMatch = headHtml.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i);
    const canonical = canonicalMatch ? canonicalMatch[1] : null;

    // Open Graph
    const ogTitle = headHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i);
    const ogDesc = headHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i);
    const ogImage = headHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);

    // Headings
    const h1s = (bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim());
    const h2s = (bodyHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim());

    // Images
    const images = bodyHtml.match(/<img[^>]*>/gi) || [];
    const imagesWithoutAlt = images.filter(img => !img.match(/alt=["'][^"']+["']/i));

    // Viewport
    const hasViewport = /meta[^>]*name=["']viewport["']/i.test(headHtml);

    // Favicon
    const hasFavicon = /link[^>]*rel=["'][^"']*icon[^"']*["']/i.test(headHtml);

    // Schema/Structured data
    const hasSchema = /application\/ld\+json/i.test(headHtml) || /itemtype=/i.test(bodyHtml);

    // Sitemap check
    let hasSitemap = false;
    try {
      const sitemapRes = await fetch(new URL('/sitemap.xml', url).href, { method: 'HEAD', timeout: 5000 });
      hasSitemap = sitemapRes.status === 200;
    } catch (_) {}

    // Robots.txt check
    let hasRobots = false;
    let robotsContent = '';
    try {
      const robotsRes = await fetch(new URL('/robots.txt', url).href, { timeout: 5000 });
      if (robotsRes.status === 200) {
        hasRobots = true;
        robotsContent = await robotsRes.text();
      }
    } catch (_) {}

    return {
      title: {
        exists: !!title,
        value: title,
        length: title ? title.length : 0,
        tooLong: title ? title.length > 60 : false,
        tooShort: title ? title.length < 30 : false
      },
      metaDescription: {
        exists: !!metaDescription,
        value: metaDescription,
        length: metaDescription ? metaDescription.length : 0,
        tooLong: metaDescription ? metaDescription.length > 160 : false,
        tooShort: metaDescription ? metaDescription.length < 120 : false
      },
      canonical: { exists: !!canonical, value: canonical },
      openGraph: {
        hasTitle: !!ogTitle,
        hasDescription: !!ogDesc,
        hasImage: !!ogImage
      },
      headings: {
        h1Count: h1s.length,
        h1Values: h1s.slice(0, 3),
        h2Count: h2s.length,
        h2Values: h2s.slice(0, 5),
        multipleH1: h1s.length > 1,
        noH1: h1s.length === 0
      },
      images: {
        total: images.length,
        withoutAlt: imagesWithoutAlt.length,
        altPercentage: images.length > 0 ? Math.round((1 - imagesWithoutAlt.length / images.length) * 100) : 100
      },
      mobile: {
        hasViewport
      },
      favicon: hasFavicon,
      schema: hasSchema,
      sitemap: hasSitemap,
      robots: { exists: hasRobots, content: robotsContent.substring(0, 500) }
    };
  } catch (err) {
    console.error('HTML analysis error:', err);
    return null;
  }
}

// ============================================
// 2. CLAUDE AI — Generate recommendations
// ============================================

async function generateAuditWithClaude(collectedData, plan = 'growth') {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const planInstructions = {
    starter: 'Genera solo las secciones: SEO, Rendimiento. Recomendaciones basicas (lista simple).',
    growth: 'Genera todas las secciones: SEO, Rendimiento, Movil, Seguridad, UX. Recomendaciones detalladas y priorizadas. Incluye analisis de 2 competidores si hay datos.',
    pro: 'Genera el informe mas completo posible con todas las secciones. Recomendaciones con pasos exactos de implementacion. Analisis de hasta 5 competidores. Incluye estimacion de impacto en conversiones.'
  };

  const systemPrompt = `Eres un experto en auditoria web con mas de 15 anos de experiencia en SEO, rendimiento web, seguridad y UX para tiendas e-commerce. Tu trabajo es analizar los datos tecnicos de un sitio web y producir un informe claro, accionable y profesional en espanol.

REGLAS:
1. Se especifico. No digas "mejorar SEO" - di exactamente que cambiar y donde.
2. Prioriza por impacto/esfuerzo. Quick wins primero.
3. Usa lenguaje que un dueno de tienda online (no tecnico) entienda.
4. Si no tienes datos suficientes para evaluar algo, indica "insufficient_data".
5. Las recomendaciones deben ser accionables HOY, no genericas.
6. Enfocate en como cada problema afecta las VENTAS y CONVERSIONES.`;

  const userPrompt = `Analiza estos datos de auditoria y genera un informe completo en JSON.

DATOS RECOPILADOS:
${JSON.stringify(collectedData, null, 2)}

PLAN DEL CLIENTE: ${plan}
INSTRUCCIONES ESPECIFICAS: ${planInstructions[plan]}

RESPONDE UNICAMENTE CON JSON VALIDO en esta estructura exacta:
{
  "global_score": <0-100>,
  "summary": "<Resumen ejecutivo en 2-3 frases>",
  "categories": {
    "seo": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "issues": [
        {
          "severity": "<critical|important|minor>",
          "title": "<Titulo del problema>",
          "description": "<Que esta mal y por que importa para las ventas>",
          "recommendation": "<Exactamente que hacer paso a paso>",
          "impact": "<Impacto esperado en trafico/conversiones>",
          "effort": "<low|medium|high>",
          "timeframe": "<Tiempo estimado para implementar>"
        }
      ]
    },
    "performance": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "metrics": {
        "lcp": {"value": "<Xs>", "rating": "<good|needs_improvement|poor>"},
        "fcp": {"value": "<Xs>", "rating": "<good|needs_improvement|poor>"},
        "cls": {"value": "<X>", "rating": "<good|needs_improvement|poor>"},
        "ttfb": {"value": "<Xms>", "rating": "<good|needs_improvement|poor>"},
        "page_weight": "<X MB>",
        "requests": <number>
      },
      "issues": [<same structure as seo issues>]
    },
    "mobile": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "issues": [<same structure>]
    },
    "security": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "headers_present": [<list>],
      "headers_missing": [<list>],
      "issues": [<same structure>]
    },
    "ux": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "issues": [<same structure>]
    }
  },
  "priority_actions": [
    {
      "rank": <1-10>,
      "action": "<Que hacer>",
      "category": "<seo|performance|mobile|security|ux>",
      "effort": "<low|medium|high>",
      "impact": "<low|medium|high>",
      "timeframe": "<Tiempo estimado>"
    }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      system: systemPrompt
    });

    const text = response.content[0].text;
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (err) {
    console.error('Claude API error:', err);
    throw new Error('Failed to generate audit analysis');
  }
}

// ============================================
// 3. MAIN AUDIT FUNCTION
// ============================================

async function runAudit(url, plan = 'growth') {
  console.log(`Starting audit for: ${url} (Plan: ${plan})`);

  // Normalize URL
  if (!url.startsWith('http')) url = 'https://' + url;

  // Collect data in parallel (all free APIs)
  console.log('Collecting data...');
  const [pageSpeedMobile, pageSpeedDesktop, securityHeaders, htmlAnalysis] = await Promise.all([
    getPageSpeedData(url, 'mobile'),
    getPageSpeedData(url, 'desktop'),
    getSecurityHeaders(url),
    getHtmlAnalysis(url)
  ]);

  const collectedData = {
    url,
    timestamp: new Date().toISOString(),
    pageSpeed: {
      mobile: pageSpeedMobile,
      desktop: pageSpeedDesktop
    },
    security: securityHeaders,
    html: htmlAnalysis
  };

  console.log('Generating AI analysis...');
  const auditReport = await generateAuditWithClaude(collectedData, plan);

  // Merge raw metrics into the report
  auditReport.raw_data = {
    pageSpeed: {
      mobile: pageSpeedMobile?.scores,
      desktop: pageSpeedDesktop?.scores
    },
    security: securityHeaders ? {
      score: securityHeaders.score,
      present: securityHeaders.present,
      missing: securityHeaders.missing
    } : null,
    html: htmlAnalysis ? {
      title: htmlAnalysis.title,
      metaDescription: htmlAnalysis.metaDescription,
      headings: htmlAnalysis.headings,
      images: htmlAnalysis.images
    } : null
  };

  auditReport.metadata = {
    url,
    plan,
    generated_at: new Date().toISOString(),
    next_audit: getNextAuditDate(plan)
  };

  console.log(`Audit complete! Global score: ${auditReport.global_score}/100`);
  return auditReport;
}

function getNextAuditDate(plan) {
  const now = new Date();
  switch (plan) {
    case 'pro': now.setDate(now.getDate() + 7); break;      // Weekly
    case 'growth': now.setDate(now.getDate() + 14); break;   // Bi-weekly
    case 'starter': now.setMonth(now.getMonth() + 1); break; // Monthly
  }
  return now.toISOString();
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  runAudit,
  getPageSpeedData,
  getSecurityHeaders,
  getHtmlAnalysis,
  generateAuditWithClaude
};
