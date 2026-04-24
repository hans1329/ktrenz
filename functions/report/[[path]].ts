// Cloudflare Pages Function: proxy /report/* to Ghost CMS on ghost.ktrenz.com.
// Rewrites Ghost asset paths and internal links so everything stays under /report/*.

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);

  const ghostPath = url.pathname.replace(/^\/report/, "") || "/";

  if (
    ghostPath !== "/" &&
    !ghostPath.endsWith("/") &&
    !ghostPath.match(/\.[a-z0-9]{2,5}$/i)
  ) {
    return Response.redirect(
      url.origin + "/report" + ghostPath + "/" + url.search,
      301,
    );
  }

  const ghostUrl = "http://ghost.ktrenz.com" + ghostPath + url.search;

  const ghostHeaders = new Headers({
    Host: "ghost.ktrenz.com",
    "X-Forwarded-Host": "ktrenz.com",
    "X-Forwarded-For": request.headers.get("CF-Connecting-IP") || "",
    "X-Forwarded-Proto": "https",
    Accept: request.headers.get("Accept") || "*/*",
    "Accept-Encoding": request.headers.get("Accept-Encoding") || "",
  });

  const response = await fetch(ghostUrl, {
    method: request.method,
    headers: ghostHeaders,
    redirect: "manual",
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location") || "";
    let newLocation = location;
    newLocation = newLocation.replace(
      /https?:\/\/ghost\.ktrenz\.com\//g,
      url.origin + "/report/",
    );
    newLocation = newLocation.replace(/^\/((?!report)[^/])/, "/report/$1");
    return Response.redirect(newLocation, response.status);
  }

  const contentType = response.headers.get("Content-Type") || "";
  const newHeaders = new Headers(response.headers);
  newHeaders.set("X-Robots-Tag", "index, follow");
  newHeaders.delete("X-Frame-Options");

  if (contentType.includes("text/html")) {
    let html = await response.text();
    html = html.replace(
      /(href|src|content)="\/(assets|public|content|ghost|favicon|shared|members)\//g,
      '$1="/report/$2/',
    );
    html = html.replace(/srcset="\/(content)\//g, 'srcset="/report/$1/');
    html = html.replace(/url\(\/(assets|content|public)\//g, "url(/report/$1/");
    html = html.replace(
      /https?:\/\/ghost\.ktrenz\.com\//g,
      "https://ktrenz.com/report/",
    );
    html = html.replace(
      /href="\/((?!report\/|assets\/|public\/|content\/|ghost\/|favicon|shared\/|members\/)[a-z0-9][a-z0-9-]*\/?)"/g,
      'href="/report/$1"',
    );
    return new Response(html, {
      status: response.status,
      headers: newHeaders,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
};
