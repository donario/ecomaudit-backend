/**
 * EcomAudit — Comprehensive Website Audit Engine v2
 *
 * Data sources (all free):
 * - Google PageSpeed Insights API (performance, SEO, accessibility)
 * - Direct HTML analysis (SEO, UX, CRO, content, technical)
 * - Security headers check
 * - Basic link health check
 * - Claude AI for expert analysis & recommendations
 *
 * Audit categories (weighted scoring):
 * - SEO (30%)
 * - Performance (30%)
 * - UX/UI (20%)
 * - Conversion/CRO (20%)
 *
 * Additional sections: Security, Content, Technical, Mobile
 */

const fetch = require('node-fetch');

// ============================================
// 1. DATA COLLECTORS
// ============================================

/**
 * Google PageSpeed Insights — Performance, SEO, Accessibility
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
        },
        inp: {
          value: audits['interaction-to-next-paint']?.displayValue || 'N/A',
          score: audits['interaction-to-next-paint']?.score || 0,
          numericValue: audits['interaction-to-next-paint']?.numericValue || 0
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
        viewport: audits['viewport']?.score === 1,
        structuredData: audits['structured-data']?.score === 1,
        imageAlt: audits['image-alt']?.score === 1
      },
      pageWeight: {
        total: lighthouse.audits['total-byte-weight']?.numericValue || 0,
        totalFormatted: lighthouse.audits['total-byte-weight']?.displayValue || 'N/A'
      },
      resourceCounts: lighthouse.audits['resource-summary']?.details?.items || [],
      accessibilityIssues: (lighthouse.audits ? Object.values(lighthouse.audits)
        .filter(a => a.id && a.id.match(/^(color-contrast|document-title|html-has-lang|image-alt|label|link-name|list|meta-viewport|tabindex)/) && a.score !== null && a.score < 1)
        .map(a => ({ id: a.id, title: a.title, description: a.description }))
        .slice(0, 10) : [])
    };
  } catch (err) {
    console.error('PageSpeed fetch error:', err);
    return null;
  }
}

/**
 * Security Headers Check
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
 * Comprehensive HTML Analysis
 * Covers: SEO, UX, CRO, Content, Technical
 */
async function getHtmlAnalysis(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EcomAudit/2.0; +https://ecomaudit.shop)'
      },
      timeout: 15000
    });

    const html = await res.text();
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headHtml = headMatch ? headMatch[1] : '';
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    // ---- SEO ----
    const titleMatch = headHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    const descMatch = headHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)
      || headHtml.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']description["']/i);
    const metaDescription = descMatch ? descMatch[1].trim() : null;

    const canonicalMatch = headHtml.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i);
    const canonical = canonicalMatch ? canonicalMatch[1] : null;

    const ogTitle = headHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i);
    const ogDesc = headHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i);
    const ogImage = headHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);
    const ogType = headHtml.match(/<meta[^>]*property=["']og:type["'][^>]*content=["'](.*?)["']/i);

    const twitterCard = headHtml.match(/<meta[^>]*name=["']twitter:card["'][^>]*content=["'](.*?)["']/i);

    const metaKeywords = headHtml.match(/<meta[^>]*name=["']keywords["'][^>]*content=["'](.*?)["']/i);

    const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
    const language = langMatch ? langMatch[1] : null;

    const noindexMatch = headHtml.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i);
    const robotsMeta = noindexMatch ? noindexMatch[1] : null;
    const isNoindex = robotsMeta ? /noindex/i.test(robotsMeta) : false;

    // Headings hierarchy
    const h1s = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    const h2s = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    const h3s = (html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

    // Images
    const images = html.match(/<img[^>]*>/gi) || [];
    const imagesWithoutAlt = images.filter(img => !img.match(/alt=["'][^"']+["']/i));
    const imagesWithEmptyAlt = images.filter(img => img.match(/alt=["']\s*["']/i));
    const lazyImages = images.filter(img => /loading=["']lazy["']/i.test(img));

    // Schema/Structured data
    const schemaScripts = headHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const schemaTypes = schemaScripts.map(s => {
      const typeMatch = s.match(/"@type"\s*:\s*"([^"]+)"/);
      return typeMatch ? typeMatch[1] : 'Unknown';
    });
    const hasMicrodata = /itemtype=/i.test(html);

    // Sitemap & Robots
    let hasSitemap = false;
    try {
      const sitemapRes = await fetch(new URL('/sitemap.xml', url).href, { method: 'HEAD', timeout: 5000 });
      hasSitemap = sitemapRes.status === 200;
    } catch (_) {}

    let hasRobots = false;
    let robotsContent = '';
    try {
      const robotsRes = await fetch(new URL('/robots.txt', url).href, { timeout: 5000 });
      if (robotsRes.status === 200) {
        hasRobots = true;
        robotsContent = await robotsRes.text();
      }
    } catch (_) {}

    // ---- UX/UI ----
    const hasViewport = /meta[^>]*name=["']viewport["']/i.test(headHtml);
    const hasFavicon = /link[^>]*rel=["'][^"']*icon[^"']*["']/i.test(headHtml);

    // Navigation
    const navElements = (html.match(/<nav[^>]*>[\s\S]*?<\/nav>/gi) || []);
    const navLinkCount = navElements.reduce((count, nav) => {
      return count + (nav.match(/<a[^>]*>/gi) || []).length;
    }, 0);

    // Footer
    const hasFooter = /<footer[^>]*>/i.test(html);
    const footerLinks = hasFooter ? (html.match(/<footer[\s\S]*?<\/footer>/i) || [''])[0].match(/<a[^>]*>/gi)?.length || 0 : 0;

    // ---- CRO (Conversion) ----
    // CTAs (buttons and link-buttons)
    const allButtons = html.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];
    const ctaLinks = html.match(/<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];
    const inputButtons = html.match(/<input[^>]*type=["'](submit|button)["'][^>]*/gi) || [];
    const totalCTAs = allButtons.length + ctaLinks.length + inputButtons.length;

    const ctaTexts = [...allButtons, ...ctaLinks].map(el =>
      el.replace(/<[^>]*>/g, '').trim()
    ).filter(t => t.length > 0).slice(0, 10);

    // Forms
    const forms = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || [];
    const formDetails = forms.map(form => {
      const inputs = (form.match(/<input[^>]*/gi) || []).length;
      const textareas = (form.match(/<textarea/gi) || []).length;
      const selects = (form.match(/<select/gi) || []).length;
      const hasAction = /action=["'][^"']+["']/i.test(form);
      return { fields: inputs + textareas + selects, hasAction };
    }).slice(0, 5);

    // Social proof
    const hasReviews = /review|testimoni|resena|opinion|valoraci/i.test(html);
    const hasRatings = /rating|stars|estrellas|puntuaci/i.test(html);
    const hasTrustBadges = /trust|badge|seguro|garantia|warranty|certificad/i.test(html);
    const hasSocialProof = hasReviews || hasRatings || hasTrustBadges;

    // Value proposition indicators
    const hasHeroBanner = /hero|banner|jumbotron/i.test(html);
    const hasPricing = /precio|price|plan|tarifa|\$|€/i.test(html);
    const hasFreeShipping = /envio\s*gratis|free\s*shipping|envio\s*gratuito/i.test(html);
    const hasGuarantee = /garantia|guarantee|devoluci|refund|money\s*back/i.test(html);

    // ---- Content ----
    // Extract visible text (rough)
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = visibleText.split(/\s+/).filter(w => w.length > 2).length;
    const paragraphs = (html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []);
    const avgParagraphLength = paragraphs.length > 0
      ? Math.round(paragraphs.reduce((sum, p) => sum + p.replace(/<[^>]*>/g, '').trim().split(/\s+/).length, 0) / paragraphs.length)
      : 0;

    // ---- Technical ----
    // Scripts
    const externalScripts = (html.match(/<script[^>]*src=["'][^"']+["'][^>]*>/gi) || []);
    const inlineScripts = (html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []);
    const scriptSources = externalScripts.map(s => {
      const srcMatch = s.match(/src=["']([^"']+)["']/i);
      return srcMatch ? srcMatch[1] : '';
    }).filter(Boolean);

    // CSS
    const externalCSS = (headHtml.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || []);
    const inlineStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []);
    const elementsWithInlineStyle = (html.match(/style=["'][^"']+["']/gi) || []).length;

    // Links
    const allLinks = html.match(/<a[^>]*href=["']([^"'#]+)["'][^>]*>/gi) || [];
    const internalLinks = allLinks.filter(a => {
      const hrefMatch = a.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return false;
      const href = hrefMatch[1];
      return href.startsWith('/') || href.includes(new URL(url).hostname);
    });
    const externalLinks = allLinks.filter(a => {
      const hrefMatch = a.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return false;
      const href = hrefMatch[1];
      return href.startsWith('http') && !href.includes(new URL(url).hostname);
    });
    const linksWithNofollow = allLinks.filter(a => /rel=["'][^"']*nofollow[^"']*["']/i.test(a));

    // iframes
    const iframes = (html.match(/<iframe[^>]*>/gi) || []);

    // HTML size
    const htmlSize = Buffer.byteLength(html, 'utf8');

    return {
      // SEO
      seo: {
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
          hasImage: !!ogImage,
          hasType: !!ogType
        },
        twitter: { hasCard: !!twitterCard },
        keywords: metaKeywords ? metaKeywords[1] : null,
        language,
        robotsMeta,
        isNoindex,
        headings: {
          h1Count: h1s.length,
          h1Values: h1s.slice(0, 3),
          h2Count: h2s.length,
          h2Values: h2s.slice(0, 8),
          h3Count: h3s.length,
          multipleH1: h1s.length > 1,
          noH1: h1s.length === 0
        },
        images: {
          total: images.length,
          withoutAlt: imagesWithoutAlt.length,
          withEmptyAlt: imagesWithEmptyAlt.length,
          altPercentage: images.length > 0 ? Math.round((1 - imagesWithoutAlt.length / images.length) * 100) : 100,
          lazyLoaded: lazyImages.length
        },
        structuredData: {
          hasJsonLd: schemaScripts.length > 0,
          types: schemaTypes,
          hasMicrodata
        },
        sitemap: hasSitemap,
        robots: { exists: hasRobots, content: robotsContent.substring(0, 500) },
        links: {
          internal: internalLinks.length,
          external: externalLinks.length,
          nofollow: linksWithNofollow.length
        }
      },

      // UX/UI
      ux: {
        hasViewport,
        hasFavicon,
        navigation: {
          hasNav: navElements.length > 0,
          navCount: navElements.length,
          navLinks: navLinkCount
        },
        footer: {
          hasFooter,
          footerLinks
        }
      },

      // CRO (Conversion)
      cro: {
        ctas: {
          total: totalCTAs,
          buttons: allButtons.length,
          linkButtons: ctaLinks.length,
          texts: ctaTexts
        },
        forms: {
          count: forms.length,
          details: formDetails
        },
        socialProof: {
          hasReviews,
          hasRatings,
          hasTrustBadges,
          hasSocialProof
        },
        valueProposition: {
          hasHeroBanner,
          hasPricing,
          hasFreeShipping,
          hasGuarantee
        }
      },

      // Content
      content: {
        wordCount,
        paragraphCount: paragraphs.length,
        avgParagraphLength,
        htmlSize: Math.round(htmlSize / 1024) + ' KB'
      },

      // Technical
      technical: {
        scripts: {
          external: externalScripts.length,
          inline: inlineScripts.length,
          sources: scriptSources.slice(0, 15)
        },
        css: {
          externalSheets: externalCSS.length,
          inlineStyles: inlineStyles.length,
          elementsWithInlineStyle
        },
        iframes: iframes.length
      }
    };
  } catch (err) {
    console.error('HTML analysis error:', err);
    return null;
  }
}

/**
 * Basic Link Health Check
 * Checks a sample of internal links for broken ones
 */
async function checkLinkHealth(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EcomAudit/2.0)' },
      timeout: 10000
    });
    const html = await res.text();
    const baseUrl = new URL(url);

    // Extract internal links
    const linkRegex = /href=["'](\/[^"']*|https?:\/\/[^"']*)/gi;
    const links = new Set();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith('/')) href = baseUrl.origin + href;
      if (href.includes(baseUrl.hostname)) links.add(href);
    }

    // Check up to 15 links
    const linksToCheck = Array.from(links).slice(0, 15);
    const results = await Promise.allSettled(
      linksToCheck.map(async (link) => {
        try {
          const r = await fetch(link, { method: 'HEAD', timeout: 5000, redirect: 'follow' });
          return { url: link, status: r.status, ok: r.status < 400 };
        } catch (e) {
          return { url: link, status: 0, ok: false, error: e.message };
        }
      })
    );

    const checked = results.map(r => r.value || r.reason);
    const broken = checked.filter(r => !r.ok);
    const redirects = checked.filter(r => r.status >= 300 && r.status < 400);

    return {
      totalChecked: linksToCheck.length,
      broken: broken.map(b => ({ url: b.url, status: b.status })),
      brokenCount: broken.length,
      redirects: redirects.length,
      healthPercentage: linksToCheck.length > 0
        ? Math.round(((linksToCheck.length - broken.length) / linksToCheck.length) * 100)
        : 100
    };
  } catch (err) {
    console.error('Link health check error:', err);
    return null;
  }
}

// ============================================
// 2. CLAUDE AI — Expert Analysis
// ============================================

async function generateAuditWithClaude(collectedData, plan = 'growth') {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const planDepth = {
    starter: 'Genera un informe basico centrado en SEO y Rendimiento. Maximo 3 problemas por categoria. Recomendaciones simples.',
    growth: 'Genera un informe completo con TODAS las 8 categorias. 3-5 problemas por categoria. Recomendaciones detalladas con pasos de implementacion. Incluye analisis de puntos de conversion.',
    pro: 'Genera el informe MAS COMPLETO posible con las 8 categorias. Hasta 8 problemas por categoria. Recomendaciones con pasos exactos, codigo de ejemplo cuando aplique, y estimacion de impacto en conversiones. Incluye benchmark contra mejores practicas del sector.'
  };

  const systemPrompt = `Eres un consultor senior de e-commerce con 15+ anos de experiencia en SEO, rendimiento web, UX/UI, CRO (optimizacion de conversiones), seguridad, y estrategia de contenido. Has auditado cientos de tiendas online y sabes exactamente que impacta las ventas.

Tu trabajo: analizar datos tecnicos de un sitio web y producir un informe PROFESIONAL y ACCIONABLE en espanol.

PRINCIPIOS:
1. ESPECIFICIDAD: Nunca digas "mejorar SEO". Di exactamente QUE cambiar, DONDE, y COMO.
2. PRIORIDAD: Ordena por impacto/esfuerzo. Quick wins primero (alto impacto + bajo esfuerzo).
3. LENGUAJE CLARO: Escribe para un dueno de tienda online, no para un desarrollador.
4. ENFOQUE EN VENTAS: Cada problema debe explicar como afecta las ventas/conversiones.
5. DATOS INSUFICIENTES: Si no puedes evaluar algo, usa "insufficient_data". No inventes.
6. HONESTIDAD: Si algo esta bien, dilo. No infles problemas para parecer mas completo.

SISTEMA DE PUNTUACION:
- Score global = SEO(30%) + Performance(30%) + UX(20%) + CRO(20%)
- Cada categoria: 0-100
- Status: "critical" (<40), "needs_work" (40-69), "good" (70-89), "excellent" (90-100)
- Prioridad de issues: impacto x esfuerzo (alto impacto + bajo esfuerzo = prioridad maxima)`;

  const userPrompt = `Analiza estos datos de auditoria del sitio web y genera un informe COMPLETO.

DATOS RECOPILADOS:
${JSON.stringify(collectedData, null, 2)}

NIVEL DE DETALLE: ${planDepth[plan]}

RESPONDE UNICAMENTE CON JSON VALIDO en esta estructura:
{
  "global_score": <0-100, calculado como SEO*0.3 + Performance*0.3 + UX*0.2 + CRO*0.2>,
  "summary": "<Resumen ejecutivo en 3-4 frases. Que va bien, que es critico, y cual es la accion mas urgente>",

  "categories": {
    "seo": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "highlights": ["<1-3 puntos positivos si los hay>"],
      "issues": [
        {
          "id": "<seo_001>",
          "severity": "<critical|important|minor>",
          "title": "<Titulo claro del problema>",
          "current_state": "<Que hay ahora (dato concreto)>",
          "expected_state": "<Que deberia haber>",
          "description": "<Por que esto importa para las ventas>",
          "recommendation": "<Pasos exactos para solucionarlo>",
          "impact": "<high|medium|low>",
          "effort": "<low|medium|high>",
          "priority": "<Resultado: impacto vs esfuerzo = maxima|alta|media|baja>",
          "timeframe": "<Tiempo estimado>"
        }
      ]
    },
    "performance": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "core_web_vitals": {
        "lcp": {"value": "<Xs>", "rating": "<good|needs_improvement|poor>", "target": "<2.5s"},
        "cls": {"value": "<X>", "rating": "<good|needs_improvement|poor>", "target": "<0.1"},
        "inp": {"value": "<Xms>", "rating": "<good|needs_improvement|poor>", "target": "<200ms"},
        "fcp": {"value": "<Xs>", "rating": "<good|needs_improvement|poor>", "target": "<1.8s"},
        "ttfb": {"value": "<Xms>", "rating": "<good|needs_improvement|poor>", "target": "<800ms"}
      },
      "page_weight": "<X MB>",
      "total_requests": <number>,
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura que seo>]
    },
    "mobile": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "is_mobile_friendly": <true|false>,
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    },
    "ux_ui": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "evaluation": {
        "navigation": {"score": <1-5>, "notes": "<observacion>"},
        "visual_hierarchy": {"score": <1-5>, "notes": "<observacion>"},
        "readability": {"score": <1-5>, "notes": "<observacion>"},
        "consistency": {"score": <1-5>, "notes": "<observacion>"},
        "mobile_ux": {"score": <1-5>, "notes": "<observacion>"}
      },
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    },
    "conversion": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "evaluation": {
        "cta_clarity": {"score": <1-5>, "notes": "<evaluacion de CTAs encontrados>"},
        "value_proposition": {"score": <1-5>, "notes": "<claridad de la propuesta de valor>"},
        "trust_signals": {"score": <1-5>, "notes": "<presencia de pruebas sociales, garantias>"},
        "friction_points": {"score": <1-5>, "notes": "<puntos de friccion encontrados>"},
        "form_optimization": {"score": <1-5>, "notes": "<evaluacion de formularios>"}
      },
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    },
    "security": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "headers_present": [<list>],
      "headers_missing": [<list>],
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    },
    "content": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "evaluation": {
        "quality": {"score": <1-5>, "notes": "<calidad general del contenido>"},
        "scannability": {"score": <1-5>, "notes": "<facilidad de escaneo visual>"},
        "seo_optimization": {"score": <1-5>, "notes": "<optimizacion del contenido para SEO>"}
      },
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    },
    "technical": {
      "score": <0-100>,
      "status": "<critical|needs_work|good|excellent>",
      "link_health": {
        "checked": <number>,
        "broken": <number>,
        "health_percentage": <number>
      },
      "highlights": ["<puntos positivos>"],
      "issues": [<misma estructura>]
    }
  },

  "priority_actions": [
    {
      "rank": <1-10>,
      "action": "<Que hacer exactamente>",
      "category": "<seo|performance|mobile|ux_ui|conversion|security|content|technical>",
      "impact": "<high|medium|low>",
      "effort": "<low|medium|high>",
      "priority": "<maxima|alta|media|baja>",
      "timeframe": "<Tiempo estimado>",
      "expected_result": "<Que mejora se espera>"
    }
  ],

  "competitor_insights": "<Si hay datos suficientes, observaciones sobre practicas estandar del sector e-commerce que este sitio deberia adoptar. Si no hay datos, null.>"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      system: systemPrompt
    }, { timeout: 600000 });

    const text = response.content[0].text;
    console.log('Claude response length:', text.length, 'chars');
    console.log('Stop reason:', response.stop_reason);
    return parseClaudeJSON(text);
  } catch (err) {
    console.error('Claude API error:', err);
    throw new Error('Failed to generate audit analysis');
  }
}

// ============================================
// JSON Parser (robust, handles truncation)
// ============================================
function parseClaudeJSON(text) {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) throw new Error('No JSON object found');
  let depth = 0, endIdx = -1, inStr = false, esc = false;
  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"' && !esc) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) {
    console.warn('JSON truncated, repairing...');
    cleaned = cleaned.substring(startIdx);
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '');
    const ob = (cleaned.match(/\{/g) || []).length, cb = (cleaned.match(/\}/g) || []).length;
    const oq = (cleaned.match(/\[/g) || []).length, cq = (cleaned.match(/\]/g) || []).length;
    cleaned += ']'.repeat(Math.max(0, oq - cq)) + '}'.repeat(Math.max(0, ob - cb));
  } else {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); }
  catch (e) { console.error('Parse fail:', e.message); throw new Error('Failed to parse audit JSON'); }
}

// ============================================
// 3. MAIN AUDIT FUNCTION
// ============================================

async function runAudit(url, plan = 'growth') {
  console.log(`\n========================================`);
  console.log(`EcomAudit v2 — Starting audit`);
  console.log(`URL: ${url}`);
  console.log(`Plan: ${plan}`);
  console.log(`========================================\n`);

  // Normalize URL
  if (!url.startsWith('http')) url = 'https://' + url;

  // Collect all data in parallel
  console.log('[1/5] Collecting PageSpeed data (mobile)...');
  console.log('[2/5] Collecting PageSpeed data (desktop)...');
  console.log('[3/5] Checking security headers...');
  console.log('[4/5] Analyzing HTML structure...');
  console.log('[5/5] Checking link health...');

  const [pageSpeedMobile, pageSpeedDesktop, securityHeaders, htmlAnalysis, linkHealth] = await Promise.all([
    getPageSpeedData(url, 'mobile'),
    getPageSpeedData(url, 'desktop'),
    getSecurityHeaders(url),
    getHtmlAnalysis(url),
    checkLinkHealth(url)
  ]);

  console.log('\nData collection complete:');
  console.log(`  PageSpeed Mobile: ${pageSpeedMobile ? 'OK' : 'FAILED'}`);
  console.log(`  PageSpeed Desktop: ${pageSpeedDesktop ? 'OK' : 'FAILED'}`);
  console.log(`  Security Headers: ${securityHeaders ? 'OK' : 'FAILED'}`);
  console.log(`  HTML Analysis: ${htmlAnalysis ? 'OK' : 'FAILED'}`);
  console.log(`  Link Health: ${linkHealth ? 'OK' : 'FAILED'}`);

  const collectedData = {
    url,
    timestamp: new Date().toISOString(),
    pageSpeed: {
      mobile: pageSpeedMobile,
      desktop: pageSpeedDesktop
    },
    security: securityHeaders,
    html: htmlAnalysis,
    linkHealth
  };

  console.log('\nGenerating AI analysis with Claude...');
  const auditReport = await generateAuditWithClaude(collectedData, plan);

  // Attach raw data for reference
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
      seo: htmlAnalysis.seo,
      cro: htmlAnalysis.cro,
      content: htmlAnalysis.content
    } : null,
    linkHealth: linkHealth || null
  };

  auditReport.metadata = {
    url,
    plan,
    version: '2.0',
    generated_at: new Date().toISOString(),
    next_audit: getNextAuditDate(plan),
    data_sources: [
      'Google PageSpeed Insights API',
      'Direct HTML Analysis',
      'Security Headers Check',
      'Link Health Check',
      'Claude AI Analysis'
    ]
  };

  console.log(`\nAudit complete! Global score: ${auditReport.global_score}/100`);
  return auditReport;
}

function getNextAuditDate(plan) {
  const now = new Date();
  switch (plan) {
    case 'pro': now.setDate(now.getDate() + 7); break;
    case 'growth': now.setDate(now.getDate() + 14); break;
    case 'starter': now.setMonth(now.getMonth() + 1); break;
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
  checkLinkHealth,
  generateAuditWithClaude
};
