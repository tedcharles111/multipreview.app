const NORTHFLANK_API = 'https://api.northflank.com/v1';

export async function createPreviewService(sessionId, downloadUrl, startCommand) {
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  const serviceName = `preview-${sessionId}`;

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

  try {
    // Create the service
    const createResponse = await fetch(`${NORTHFLANK_API}/projects/${projectId}/services`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NORTHFLANK_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(servicePayload),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Northflank API error: ${createResponse.status} - ${error}`);
    }

    const service = await createResponse.json();
    const serviceId = service.data.id;

    // Wait for service to become healthy
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusResponse = await fetch(
        `${NORTHFLANK_API}/projects/${projectId}/services/${serviceId}`,
        {
          headers: { 'Authorization': `Bearer ${process.env.NORTHFLANK_API_TOKEN}` },
        }
      );
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
  } catch (error) {
    console.error('Northflank service creation error:', error);
    throw error;
  }
}

export async function stopService(serviceId) {
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  try {
    const response = await fetch(
      `${NORTHFLANK_API}/projects/${projectId}/services/${serviceId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${process.env.NORTHFLANK_API_TOKEN}` },
      }
    );
    return response.ok;
  } catch (error) {
    console.error('Error stopping service:', error);
    return false;
  }
}
