// region: --- Interface Definitions ---
export interface DoubanItem {
  title: string;
  poster: string;
  rate?: string;
}

export interface DoubanResponse {
  code: number;
  message: string;
  list: DoubanItem[];
}

export interface VideoDetail {
  id: string;
  title: string;
  poster: string;
  source: string;
  source_name: string;
  desc?: string;
  type?: string;
  year?: string;
  area?: string;
  director?: string;
  actor?: string;
  remarks?: string;
}

export interface SearchResult {
  id: number;
  title: string;
  poster: string;
  episodes: string[];
  source: string;
  source_name: string;
  class?: string;
  year: string;
  desc?: string;
  type_name?: string;
}

export interface Favorite {
  cover: string;
  title: string;
  source_name: string;
  total_episodes: number;
  search_title: string;
  year: string;
  save_time?: number;
}

export interface PlayRecord {
  title: string;
  source_name: string;
  cover: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
  year: string;
}

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

export interface LinuxDoOAuthConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri?: string;
  minTrustLevel: number;
  autoRegister: boolean;
  defaultRole: "owner" | "admin" | "user";
}

export interface ServerConfig {
  SiteName: string;
  StorageType: "localstorage" | "redis" | string;
  LinuxDoOAuth?: LinuxDoOAuthConfig;
}

export class API {
  public baseURL: string = "";

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  public setBaseUrl(url: string) {
    this.baseURL = url;
  }

  private async _fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.baseURL) {
      throw new Error("API_URL_NOT_SET");
    }

    // 确保所有API调用都携带Cookie
    const fetchOptions: RequestInit = {
      credentials: 'include',
      ...options
    };

    const response = await fetch(`${this.baseURL}${url}`, fetchOptions);

    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }

  async getServerConfig(): Promise<ServerConfig> {
    const response = await this._fetch("/api/server-config");
    return response.json();
  }

  async login(username?: string | undefined, password?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this._fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      return response.json();
    } catch (error) {
      // 如果是401错误，尝试获取错误详情
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        try {
          const response = await fetch(`${this.baseURL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          
          if (response.status === 401) {
            const errorData = await response.json().catch(() => ({}));
            return {
              ok: false,
              error: errorData.error || "用户名或密码错误"
            };
          }
        } catch (fetchError) {
          // 忽略二次请求错误
        }
        
        return {
          ok: false,
          error: "用户名或密码错误"
        };
      }
      
      throw error; // 重新抛出其他错误
    }
  }

  startLinuxDoOAuth(): string {
    // 直接返回授权接口地址，让浏览器处理重定向
    // 添加mobile=1参数确保后端能识别移动应用请求
    const authUrl = `${this.baseURL}/api/oauth/authorize?mobile=1`;
    console.log('LinuxDO OAuth: 直接使用浏览器打开授权地址:', authUrl);
    return authUrl;
  }

  async handleOAuthCallback(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = new URL(`${this.baseURL}/api/oauth/callback`);
      url.searchParams.set('code', code);
      url.searchParams.set('state', state);
      
      console.log('Sending OAuth callback request to:', url.toString());
      
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          'X-Mobile-App': 'true',
          'User-Agent': 'OrionTV/1.0 Mobile',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json'
        },
        credentials: 'include', // 确保接收cookies
        redirect: "manual" // 手动处理重定向以确保cookies被正确设置
      });
      
      // 记录详细的响应信息用于调试
      const responseHeaders = Array.from(response.headers.entries());
      console.log('OAuth callback response:', {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
      });
      
      // 检查Set-Cookie头
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        console.log('OAuth回调接收到cookies:', setCookieHeader);
      } else {
        console.warn('OAuth回调未接收到cookies');
      }
      
      // 处理不同的响应状态
      if (response.ok) {
        // 200 OK - 尝试解析响应体
        try {
          const responseText = await response.text();
          console.log('OAuth callback response body:', responseText);
          
          // 如果响应体包含错误信息
          if (responseText.includes('error') || responseText.includes('failed')) {
            try {
              const responseJson = JSON.parse(responseText);
              if (responseJson.error) {
                return { ok: false, error: responseJson.error };
              }
            } catch (parseError) {
              // 不是JSON格式，继续检查文本内容
              if (responseText.toLowerCase().includes('error')) {
                return { ok: false, error: '授权处理失败' };
              }
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse OAuth callback response body:', parseError);
        }
        
        // 200 OK 且无错误，认为成功
        return { ok: true };
      }
      
      if (response.status === 302 || response.status === 301) {
        // 重定向处理
        const location = response.headers.get('location');
        console.log('OAuth callback redirect location:', location);
        
        if (location?.includes('error=')) {
          const errorMatch = location.match(/error=([^&]+)/);
          const error = errorMatch ? decodeURIComponent(errorMatch[1]) : '授权失败';
          return { ok: false, error };
        }
        
        // 重定向成功，认为OAuth成功
        return { ok: true };
      }
      
      // 处理其他错误状态
      let errorText = `HTTP ${response.status}`;
      try {
        const responseText = await response.text();
        console.log('OAuth callback error response:', responseText);
        if (responseText) {
          errorText = responseText;
          
          // 尝试解析JSON错误响应
          try {
            const errorJson = JSON.parse(responseText);
            if (errorJson.error) {
              errorText = errorJson.error;
            } else if (errorJson.message) {
              errorText = errorJson.message;
            }
          } catch (parseError) {
            // 不是JSON格式，使用原始文本
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse error response:', parseError);
      }
      
      return { ok: false, error: `回调处理失败: ${errorText}` };
    } catch (error) {
      console.error('OAuth callback network error:', error);
      if (error instanceof Error) {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: '回调处理失败' };
    }
  }

  async getFavorites(key?: string): Promise<Record<string, Favorite> | Favorite | null> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url);
    return response.json();
  }

  async addFavorite(key: string, favorite: Omit<Favorite, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, favorite }),
    });
    return response.json();
  }

  async deleteFavorite(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getPlayRecords(): Promise<Record<string, PlayRecord>> {
    const response = await this._fetch("/api/playrecords");
    return response.json();
  }

  async savePlayRecord(key: string, record: Omit<PlayRecord, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/playrecords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, record }),
    });
    return response.json();
  }

  async deletePlayRecord(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/playrecords?key=${encodeURIComponent(key)}` : "/api/playrecords";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getSearchHistory(): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory");
    return response.json();
  }

  async addSearchHistory(keyword: string): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    return response.json();
  }

  async deleteSearchHistory(keyword?: string): Promise<{ success: boolean }> {
    const url = keyword ? `/api/searchhistory?keyword=${keyword}` : "/api/searchhistory";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  getImageProxyUrl(imageUrl: string): string {
    return `${this.baseURL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  }

  async getDoubanData(
    type: "movie" | "tv",
    tag: string,
    pageSize: number = 16,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const url = `/api/douban?type=${type}&tag=${encodeURIComponent(tag)}&pageSize=${pageSize}&pageStart=${pageStart}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async searchVideos(query: string): Promise<{ results: SearchResult[] }> {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async searchVideo(query: string, resourceId: string, signal?: AbortSignal): Promise<{ results: SearchResult[] }> {
    const url = `/api/search/one?q=${encodeURIComponent(query)}&resourceId=${encodeURIComponent(resourceId)}`;
    const response = await this._fetch(url, { signal });
    const { results } = await response.json();
    return { results: results.filter((item: any) => item.title === query )};
  }

  async getResources(signal?: AbortSignal): Promise<ApiSite[]> {
    const url = `/api/search/resources`;
    const response = await this._fetch(url, { signal });
    return response.json();
  }

  async getVideoDetail(source: string, id: string): Promise<VideoDetail> {
    const url = `/api/detail?source=${source}&id=${id}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async register(username: string, password: string, confirmPassword?: string): Promise<{ ok: boolean; error?: string; message?: string; needsApproval?: boolean }> {
    try {
      const response = await this._fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword: confirmPassword || password }),
      });
      
      const data = await response.json();
      
      // 处理LunaTV后端的响应格式: { success: boolean, message: string, needsApproval?: boolean }
      // 转换为前端期望的格式: { ok: boolean, error?: string, message?: string, needsApproval?: boolean }
      if (data.success !== undefined) {
        return {
          ok: data.success,
          error: data.success ? undefined : data.message,
          message: data.message,
          needsApproval: data.needsApproval
        };
      }
      
      // 保持兼容旧格式
      return data;
    } catch (error) {
      // 处理HTTP错误，尝试获取错误详情
      if (error instanceof Error && error.message.includes("HTTP error!")) {
        try {
          const response = await fetch(`${this.baseURL}/api/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, confirmPassword: confirmPassword || password }),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
              ok: false,
              error: errorData.message || errorData.error || "注册失败"
            };
          }
        } catch (fetchError) {
          // 忽略二次请求错误
        }
      }
      
      throw error; // 重新抛出其他错误
    }
  }

  async logout(): Promise<{ ok: boolean }> {
    const response = await this._fetch("/api/logout", {
      method: "POST",
    });
    return response.json();
  }
}

// 默认实例
export let api = new API();
