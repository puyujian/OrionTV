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

    const response = await fetch(`${this.baseURL}${url}`, options);

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

  async startLinuxDoOAuth(): Promise<string> {
    try {
      console.log('=== LinuxDo OAuth Debug Log Start ===');
      console.log('Starting LinuxDo OAuth request to:', `${this.baseURL}/api/oauth/authorize`);
      console.log('Request method: GET, redirect: manual');
      
      const requestHeaders = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Mobile-App': 'true',
        'User-Agent': 'OrionTV/1.0 Mobile'
      };
      console.log('Request headers:', requestHeaders);
      
      const response = await fetch(`${this.baseURL}/api/oauth/authorize`, {
        method: "GET",
        redirect: "manual", // 关键：阻止自动跟踪重定向，手动处理第一次响应
        headers: requestHeaders
      });
      
      console.log('=== First Response Received ===');
      console.log('Response status:', response.status);
      console.log('Response type:', response.type);
      console.log('Response redirected:', response.redirected);
      console.log('Response URL:', response.url);
      
      const allHeaders = Object.fromEntries(response.headers.entries());
      console.log('All response headers:', allHeaders);
      
      // 立即检查Location头 - 这是关键的第一次重定向响应
      const locationHeader = response.headers.get('Location') || response.headers.get('location');
      console.log('Location header (case-sensitive):', response.headers.get('Location'));
      console.log('location header (lowercase):', response.headers.get('location'));
      console.log('Final locationHeader value:', locationHeader);
      
      // 关键修复：立即处理第一次响应，不论状态码
      if (locationHeader) {
        console.log('=== SUCCESS: Found Location header in first response ===');
        console.log('Authorization URL:', locationHeader);
        console.log('Returning immediately without following redirects');
        return locationHeader;
      }
      
      // 优先处理重定向状态码（3xx）- 但此时已经检查过Location头
      if (response.status >= 300 && response.status < 400) {
        console.log('=== 3xx Redirect Status Detected ===');
        console.log('Status code:', response.status);
        console.warn('Redirect response detected but no Location header found - this is unusual');
        
        // 再次尝试不同的头字段名称变体
        const alternativeHeaders = [
          'location', 'Location', 'LOCATION',
          'Redirect', 'redirect', 'REDIRECT'
        ];
        
        for (const headerName of alternativeHeaders) {
          const headerValue = response.headers.get(headerName);
          if (headerValue) {
            console.log(`Found authorization URL in header '${headerName}':`, headerValue);
            return headerValue;
          }
        }
      }
      
      // 对于2xx状态码，检查是否服务器用其他方式返回URL
      console.log('=== Checking 2xx Response for Authorization URL ===');
      const contentType = response.headers.get('Content-Type') || '';
      console.log('Content-Type:', contentType);
      
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          console.log('=== Response Body Data ===');
          console.log('Raw response data:', JSON.stringify(data, null, 2));
          
          // 检查多种可能的字段名，按优先级排序
          const possibleFields = [
            'url', 'authorization_url', 'authorize_url', 'location',
            'redirect_url', 'auth_url', 'login_url', 'oauth_url'
          ];
          
          for (const field of possibleFields) {
            if (data[field]) {
              console.log(`=== SUCCESS: Found authorization URL in field '${field}' ===`);
              console.log('Authorization URL:', data[field]);
              return data[field];
            }
          }
          
          console.warn('No authorization URL found in any expected response fields');
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError);
        }
      } else {
        // 尝试解析非JSON响应
        try {
          const responseText = await response.text();
          console.log('=== Non-JSON Response Body ===');
          console.log('Response text (first 500 chars):', responseText.substring(0, 500));
          
          // 尝试从HTML或文本中提取URL
          const urlMatch = responseText.match(/https?:\/\/[^\s<>"']+/);
          if (urlMatch) {
            console.log('=== Found URL in response text ===');
            console.log('Extracted URL:', urlMatch[0]);
            return urlMatch[0];
          }
        } catch (textError) {
          console.error('Failed to parse response as text:', textError);
        }
      }
      
      // 最终错误处理 - 提供完整的调试信息
      console.error('=== FAILURE: No authorization URL found ===');
      console.error('Final attempt - dumping all available information:');
      console.error('Response status:', response.status);
      console.error('Response statusText:', response.statusText);
      console.error('Response type:', response.type);
      console.error('Response redirected:', response.redirected);
      console.error('Response URL:', response.url);
      console.error('All headers:', Object.fromEntries(response.headers.entries()));
      
      throw new Error(`获取授权链接失败 - 状态码: ${response.status}, 响应类型: ${response.type}`);
      
    } catch (error) {
      console.error('LinuxDo OAuth error:', error);
      
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OAuth启动失败，请检查网络连接');
    }
  }

  async handleOAuthCallback(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = new URL(`${this.baseURL}/api/oauth/callback`);
      url.searchParams.set('code', code);
      url.searchParams.set('state', state);
      
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          'X-Mobile-App': 'true',
          'User-Agent': 'OrionTV/1.0 Mobile'
        },
        redirect: "manual"
      });
      
      if (response.status === 302 || response.status === 301) {
        const location = response.headers.get('Location');
        if (location?.includes('oriontv://oauth/callback?success=true')) {
          return { ok: true };
        }
        if (location?.includes('error=')) {
          const errorMatch = location.match(/error=([^&]+)/);
          const error = errorMatch ? decodeURIComponent(errorMatch[1]) : '授权失败';
          return { ok: false, error };
        }
        return { ok: true }; // 其他重定向也认为是成功
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, error: `回调处理失败: ${errorText}` };
      }
      
      return { ok: true };
    } catch (error) {
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
