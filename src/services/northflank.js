const NORTHFLANK_BASE = 'https://api.northflank.com';

// Try common endpoint patterns
const endpoints = [
  `${NORTHFLANK_BASE}/v1/projects/${process.env.NORTHFLANK_PROJECT_ID}/services`,
  `${NORTHFLANK_BASE}/v2/projects/${process.env.NORTHFLANK_PROJECT_ID}/services`,
  `${NORTHFLANK_BASE}/projects/${process.env.NORTHFLANK_PROJECT_ID}/services`,
  `${NORTHFLANK_BASE}/v1/projects/${process.env.NORTHFLANK_PROJECT_ID}/deployments`,
  `${NORTHFLANK_BASE}/v1/projects/${process.env.NORTHFLANK_PROJECT_ID}/services/create`,
  `${NORTHFLANK_BASE}/v1/projects/${process.env.NORTHFLANK_PROJECT_ID}/services/deploy`,
];

export async function createPreviewService(sessionId, downloadUrl, startCommand) {
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  const token = process.env.NORTHFLANK_API_TOKEN;
  const serviceName = `preview-${sessionId}`;

  console.log('========== Northflank Debug ==========');
  console.log('Project ID:', projectId);
  console.log('Token exists:', !!token);
  if (!projectId || !token) {
    throw new Error('NORTHFLANK_PROJECT_ID and NORTHFLANK_API_TOKEN must be set');
  }

  let port = 3000;
  if (startCommand.includes('vite') || startCommand.includes('dev')) {
    port = 5173;
  }

  const startupScript = `curl -s ${downloadUrl} | tar -xzv && npm install && ${startCommand}`;

  const servicePayload = {
    name: serviceName,
    billing: { deploymentPlan: 'nf-compute-20' },
    deployment: {
      instances: 1,
      external: {
        imagePath: 'node:18-alpine',
        command: ['/bin/sh', '-c', startupScript],
        ports: [{ portNumber: port, protocol: 'HTTP', public: true }],
        environmentVariables: [],
      },
    },
  };

  console.log('Payload:', JSON.stringify(servicePayload, null, 2));

  let lastError = null;

  for (const url of endpoints) {
    console.log('Trying endpoint:', url);

    // First, try a GET request to see if the endpoint exists
    try {
      const getResponse = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('GET status:', getResponse.status);
      if (getResponse.ok) {
        const getData = await getResponse.text();
        console.log('GET response (first 200 chars):', getData.substring(0,200));
      } else {
        console.log('GET failed with', getResponse.status);
      }
    } catch (e) {
      console.log('GET error:', e.message);
    }

    // Now try POST
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(servicePayload),
      });

      const responseText = await response.text();
      console.log('POST status:', response.status);
      console.log('POST response:', responseText);

      if (response.ok) {
        const data = JSON.parse(responseText);
        const serviceId = data.data.id;

        // Wait for service to become healthy
        console.log('Waiting for service to become healthy...');
        let ready = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusUrl = `${NORTHFLANK_BASE}/v1/projects/${projectId}/services/${serviceId}`;
          const statusResponse = await fetch(statusUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status.data.status === 'running' && status.data.deploymentStatus === 'healthy') {
              ready = true;
              break;
            }
          }
        }

        if (!ready) throw new Error('Service did not become healthy in time');

        const previewUrl = `https://${serviceName}.northflank.app`;
        return { serviceId, previewUrl };
      }
    } catch (error) {
      console.error(`Error with endpoint ${url}:`, error);
      lastError = error;
    }
  }

  throw new Error(`All endpoints failed. Last error: ${lastError?.message || 'unknown'}`);
}

export async function stopService(serviceId) {
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  const token = process.env.NORTHFLANK_API_TOKEN;
  try {
    const url = `${NORTHFLANK_BASE}/v1/projects/${projectId}/services/${serviceId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return response.ok;
  } catch (error) {
    console.error('Error stopping service:', error);
    return false;
  }
}
