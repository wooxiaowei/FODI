/**
 * EXPOSE_PATH：暴露路径，如全盘展示请留空，否则按 '/媒体/音乐' 的格式填写
 * ONEDRIVE_REFRESHTOKEN: refresh_token
 */
const EXPOSE_PATH = ""
const ONEDRIVE_REFRESHTOKEN = ""


async function handleRequest(request) {
  let requestPath
  let querySplited
  let queryString = request.url.split('?')[1]
  if (queryString) {
    querySplited = queryString.split('=')
  }
  if (querySplited && querySplited[0] === 'file') {
    const file = querySplited[1]
    const fileName = file.split('/').pop();
    requestPath = file.replace('/' + fileName, '')
    const url = await fetchFiles(requestPath, fileName)
    return Response.redirect(url, 302)
  } else {
    const { headers } = request
    const contentType = headers.get('content-type')
    let body
    if (contentType && contentType.includes('form')) {
      const formData = await request.formData()
      body = {}
      for (let entry of formData.entries()) {
        body[entry[0]] = entry[1]
      }
    }
    requestPath = body ? body['?path'] : '';
    const files = await fetchFiles(requestPath, null, body.passwd);
    return new Response(files, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

addEventListener('fetch', event => {
  return event.respondWith(handleRequest(event.request))
})

const OAUTH = {
  'redirectUri': 'https://scfonedrive.github.io',
  'refreshToken': ONEDRIVE_REFRESHTOKEN,
  'clientId': '4da3e7f2-bf6d-467c-aaf0-578078f0bf7c',
  'clientSecret': '7/+ykq2xkfx:.DWjacuIRojIaaWL0QI6',
  'oauthUrl': 'https://login.microsoftonline.com/common/oauth2/v2.0/',
  'apiUrl': 'https://graph.microsoft.com/v1.0/me/drive/root',
  'scope': 'https://graph.microsoft.com/Files.ReadWrite.All offline_access'
}

async function gatherResponse(response) {
  const { headers } = response
  const contentType = headers.get('content-type')
  if (contentType.includes('application/json')) {
    return await response.json()
  } else if (contentType.includes('application/text')) {
    return await response.text()
  } else if (contentType.includes('text/html')) {
    return await response.text()
  } else {
    return await response.text()
  }
}

async function getContent(url) {
  const response = await fetch(url)
  const result = await gatherResponse(response)
  return result
}

async function getContentWithHeaders(url, headers) {
  const response = await fetch(url, { headers: headers })
  const result = await gatherResponse(response)
  return result
}

async function fetchFormData(url, data) {
  const formdata = new FormData();
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      formdata.append(key, data[key])
    }
  }
  const requestOptions = {
    method: 'POST',
    body: formdata
  };
  const response = await fetch(url, requestOptions)
  const result = await gatherResponse(response)
  return result
}

async function fetchAccessToken() {
  url = OAUTH['oauthUrl'] + 'token'
  data = {
    'client_id': OAUTH['clientId'],
    'client_secret': OAUTH['clientSecret'],
    'grant_type': 'refresh_token',
    'requested_token_use': 'on_behalf_of',
    'refresh_token': OAUTH['refreshToken']
  }
  const result = await fetchFormData(url, data)
  return result.access_token
}

async function fetchFiles(path, fileName, passwd) {
  if (!path || path === '/') {
    if (EXPOSE_PATH === '') {
      path = ''
    } else {
      path = ':' + EXPOSE_PATH
    }
  } else {
    if (EXPOSE_PATH === '') {
      path = ':' + path
    } else {
      path = ':' + EXPOSE_PATH + path
    }
  }

  const accessToken = await fetchAccessToken()
  const uri = OAUTH.apiUrl + encodeURI(path) + '?expand=children(select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl)'

  const body = await getContentWithHeaders(uri, {
    Authorization: 'Bearer ' + accessToken
  })
  if (fileName) {
    let thisFile = null
    body.children.forEach(file => {
      if (file.name === decodeURIComponent(fileName)) {
        thisFile = file['@microsoft.graph.downloadUrl']
        return
      }
    })
    return thisFile
  } else {
    let files = []
    let encrypted = false
    for (let i = 0; i < body.children.length; i++) {
      const file = body.children[i]
      if (file.name === '.password') {
        const PASSWD = await getContent(file['@microsoft.graph.downloadUrl'])
        if (PASSWD !== passwd) {
          encrypted = true;
          break
        } else {
          continue
        }
      }
      files.push({
        name: file.name,
        size: file.size,
        time: file.lastModifiedDateTime,
        url: file['@microsoft.graph.downloadUrl']
      })
    }
    let parent
    if (body.children.length) {
      parent = body.children[0].parentReference.path
    } else {
      parent = body.parentReference.path
    }
    parent = parent.split(':').pop().replace(EXPOSE_PATH, '') || '/'
    if (encrypted) {
      return JSON.stringify({ parent: parent, files: [], encrypted: true })
    } else {
      return JSON.stringify({ parent: parent, files: files })
    }
  }
}
