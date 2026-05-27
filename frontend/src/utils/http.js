function parseHeaders(rawHeaders) {
  const headers = {};
  if (!rawHeaders) return headers;

  rawHeaders
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const index = line.indexOf(":");
      if (index === -1) return;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      headers[key] = value;
    });

  return headers;
}

function parseBody(xhr, responseType) {
  if (responseType === "blob") return xhr.response;

  const contentType = xhr.getResponseHeader("Content-Type") || "";
  const text = xhr.responseText;

  if (!text) return null;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function makeError(xhr, responseType) {
  const error = new Error(`Request failed with status code ${xhr.status}`);
  error.response = {
    status: xhr.status,
    data: parseBody(xhr, responseType),
    headers: parseHeaders(xhr.getAllResponseHeaders()),
  };
  return error;
}

function request(method, url, data, config = {}) {
  const { headers = {}, responseType, onUploadProgress } = config;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    if (responseType === "blob") {
      xhr.responseType = "blob";
    }

    Object.entries(headers).forEach(([key, value]) => {
      if (value != null) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.onload = () => {
      const response = {
        data: parseBody(xhr, responseType),
        status: xhr.status,
        headers: parseHeaders(xhr.getAllResponseHeaders()),
      };

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        reject(makeError(xhr, responseType));
      }
    };

    xhr.onerror = () => {
      const error = new Error("Network Error");
      error.code = "ERR_NETWORK";
      reject(error);
    };

    if (xhr.upload && typeof onUploadProgress === "function") {
      xhr.upload.onprogress = (event) => {
        onUploadProgress(event);
      };
    }

    xhr.send(data ?? null);
  });
}

export const get = (url, config) => request("GET", url, null, config);
export const post = (url, data, config) => request("POST", url, data, config);
export const put = (url, data, config) => request("PUT", url, data, config);
export const patch = (url, data, config) => request("PATCH", url, data, config);
export const del = (url, config) => request("DELETE", url, null, config);

const http = {
  get,
  post,
  put,
  patch,
  delete: del,
};

export default http;
