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

  async login(username?: string | undefined, password?: string): Promise<{ ok: boolean }> {
    const response = await this._fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.json();
  }

  async startLinuxDoOAuth(): Promise<string> {
    try {
      // 直接请求授权接口，让它重定向到LinuxDo
      const response = await fetch(`${this.baseURL}/api/oauth/authorize?mobile=1`, {
        method: "GET",
        redirect: "manual", // 手动处理重定向，这样我们可以获取重定向的URL
        headers: {
          'X-Mobile-App': 'true',
          'User-Agent': 'OrionTV-Mobile'
        }
      });
      
      // 检查是否是重定向响应
      if (response.status === 302 || response.status === 301) {
        const location = response.headers.get('Location');
        if (location && location.includes('connect.linux.do')) {
          return location;
        }
      }
      
      // 如果不是重定向，检查最终响应的URL（通过follow模式）
      const followResponse = await fetch(`${this.baseURL}/api/oauth/authorize?mobile=1`, {
        method: "GET",
        redirect: "follow",
        headers: {
          'X-Mobile-App': 'true',
          'User-Agent': 'OrionTV-Mobile'
        }
      });
      
      // 检查最终响应的URL
      if (followResponse.url && followResponse.url.includes('connect.linux.do')) {
        return followResponse.url;
      }
      
      // 如果还是没有获取到正确的URL，尝试从响应体解析
      if (followResponse.ok) {
        try {
          const data = await followResponse.json();
          if (data.authorizeUrl && data.authorizeUrl.includes('connect.linux.do')) {
            return data.authorizeUrl;
          }
        } catch (e) {
          // 如果不是JSON，尝试从HTML中解析
          try {
            const html = await followResponse.text();
            const linkMatch = html.match(/href="([^"]*connect\.linux\.do[^"]*)"/i);
            if (linkMatch && linkMatch[1]) {
              return linkMatch[1];
            }
          } catch (htmlError) {
            // 忽略HTML解析错误
          }
        }
      }
      
      // 如果所有方法都失败，抛出具体的错误信息
      throw new Error(`获取授权链接失败。响应状态：${followResponse.status}`);
      
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('网络连接失败，请检查网络设置');
      }
      
      if (error instanceof Error) {
        // 特殊处理HTTP 429错误
        if (error.message.includes('429')) {
          throw new Error('请求频率过高，请稍后再试');
        }
        throw new Error(`OAuth启动失败: ${error.message}`);
      }
      
      throw new Error("OAuth启动失败: 未知错误");
    }
  }

  async handleOAuthCallback(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this._fetch(`/api/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    if (response.status === 302 || response.redirected) {
      return { ok: true };
    }
    return response.json();
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

  async register(username: string, password: string, confirmPassword?: string): Promise<{ ok: boolean; error?: string }> {
    const response = await this._fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, confirmPassword: confirmPassword || password }),
    });
    
    const data = await response.json();
    
    // 处理LunaTV后端的响应格式: { success: boolean, message: string }
    // 转换为前端期望的格式: { ok: boolean, error?: string }
    if (data.success !== undefined) {
      return {
        ok: data.success,
        error: data.success ? undefined : data.message
      };
    }
    
    // 保持兼容旧格式
    return data;
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
