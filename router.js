function Router() {
    let routes = arguments[0],
        e404,
        callback,
        cmp,
        params,
        query;

    if (arguments.length === 2) {
        callback = arguments[1];
        e404 = null;
    } else if (arguments.length === 3) {
        callback = arguments[2];
        e404 = arguments[1];
    }

    addEventListener("click", route);
    addEventListener("replacestate", route);
    addEventListener("popstate", route);
    addEventListener("pushstate", route);

    addEventListener("DOMContentLoaded", () => {
        let links = document.querySelectorAll("a[href]");
        if (links) {
            Array.from(links).map((link) => {
                link.onclick = function (ev) {
                    let href = ev.target.getAttribute("href");
                    ev.preventDefault();
                    route(href);
                    try {
                        history.pushState("", "", href);
                    } catch (error) {
                        if (href.startsWith("http")) {
                            open(href, "_blank");
                        } else {
                            console.log(error);
                        }
                    }
                };
            });
        }
    });

    async function route(pathname = location.pathname + location.search) {
        if (typeof pathname === "object") pathname = location.pathname + location.search;

        params = {};
        query = pathname.includes("?") || {};

        if (query) {
            query = pathname.replace(/.*\?/, "").replace(/\=\=/g, "=").replace(/\&\&/g, "&").split("&");
            query.map((q) => {
                params[q.split("=")[0]] = q.split("=")[1];
            });
            query = params;
            pathname = pathname.replace(location.search, "");
        }

        let match = routes.filter((route) => pathname.match(/\/[^\/]*/)[0] === route.path);

        if (match[0]) {
            let route = match[0];
            if (typeof route.page === "function") cmp = route.page;
            else cmp = (await route.page).default;
            params = pathname.split("?")[0].slice(1).split("/");
            if (pathname.includes("?")) {
                pathname
                    .split("?")[1]
                    .replace(/\&/g, ",")
                    .replace(/\=/g, ":")
                    .split(",")
                    .map((prop) => {
                        let tup = prop.split(":");
                        query[tup[0]] = !isNaN(tup[1]) ? Number(tup[1]) : `${tup[1]}`;
                    });
            }
        } else {
            cmp = e404;
        }

        callback({
            cmp,
            params,
            query,
        });
    }

    return {
        route,
    };
}

export default Router;
