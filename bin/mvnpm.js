#! /usr/bin/env node
var fs = require('fs');
var parseString = require('xml2js').parseString;
var shell = require("shelljs/global");

if (!which('git')) {
    echo('[mvnpm] Sorry this script requires git');
    exit(1);
}
if (!which('mvn')) {
    echo('[mvnpm] Sorry this script requires mvn');
    exit(1);
}



//var config = JSON.parse(fs.readFileSync('mvnpm.json'));
var currDir = pwd();
var mvnpmDir = currDir + '/.mvnpm';

var cmd = 'install-deps';
if (process.argv.length > 1) {
    cmd = process.argv[2];
}





function loadDependencies(projectDir, mvnpmDir) {
    cd(projectDir);
    if (!test('-e', '.mvnpm')) {
        mkdir('.mvnpm');
    }
    echo("[mvnpm] Loading dependencies in "+projectDir);
    
    var projectConfigFile = projectDir + '/mvnpm.json';
    if (!test('-e', projectConfigFile)) {
        echo('[mvnpm] No project config file found for project '+projectDir+'.  Skipping.');
        return;
    }
    
    var projectConfig = JSON.parse(fs.readFileSync(projectConfigFile, 'utf-8'));
    console.log("Project config: "+projectConfig);
    

    echo("[mvnpm] Found "+projectConfig.dependencies.length+" dependencies");
    if (projectConfig.dependencies) {
        projectConfig.dependencies.forEach(function(mod) {
            cd(mvnpmDir);
            var url = mod.url;
            var dirname = url.substr(url.lastIndexOf('/'));
            var modPath = mvnpmDir + '/' + dirname;
            if (!test('-e', modPath)) {
                cd(mvnpmDir);
                exec('git clone ' + url);
            }
            cd(modPath);
            exec('git fetch origin');
            
            if (mod.version && mod.version != 'master') {
                exec('git checkout tags/'+mod.version);
            } else {
                exec('git checkout master');
                exec('git pull origin master');
            }
            
            // Now update the pom file
            var subdir = '';
            if (mod.path) {
                subdir = '/' + mod.path;
            }
            cd(modPath + subdir);
            if (exec('mvnpm install').code !== 0) {
                echo("Failed to install module "+mod.url);
                exit(1);
            }
            
        });
    }
}

function getModuleInfo(moduleDir) {
    var conf = {};
    if (test('-e', moduleDir+'/mvnpm.json')) {
        conf = JSON.parse(fs.readFileSync(moduleDir+'/mvnpm.json'));
    }

    var pomFile = conf.pom || 'pom.xml';
    var pomPath = moduleDir + '/' + pomFile;
    cd(moduleDir);
    if (test('-e', pomPath)) {
        var content = fs.readFileSync(pomPath);
        //console.log(pomPath + " content: "+content);
        parseString(content, function(err, result) {
            conf._pom = result;
            conf.version = conf._pom.project.version[0];
            conf.groupId = conf._pom.project.groupId[0];
            conf.artifactId = conf._pom.project.artifactId[0];
        });
        
    } else {
        
    }
    conf.path = moduleDir;
    return conf;
}

function getDependencies(projectDir) {
    var deps = [];
    var files=fs.readdirSync(projectDir+'/.mvnpm');
    files.forEach(function(file) {
        deps.push(getModuleInfo(projectDir+'/.mvnpm/'+file));
    });
    return deps;
}





function install(projectDir, mvnpmDir) {
    echo("[mvnpm] Installing project "+projectDir);
    cd(projectDir);
    var projectConfig = getModuleInfo(projectDir);
    var pomFile = projectConfig.pom || 'pom.xml';
    if (!test('-e', pomFile)) {
        echo('Project is missing pom file.  '+pomFile+' not found.');
        exit(1);
    }
    updateVersions(projectDir, projectDir+'/'+pomFile);
    
    if (projectConfig.buildTool == 'ant') {
        var target = mod.antTarget || 'install';
        if (exec('ant ' + target).code !== 0) {
            echo("Failed to istall project with ant");
            exit(1);
        }
    } else {
        if (exec('mvn install').code !== 0) {
            echo("Failed to install project with maven.");
            exit(1);
        }
    }
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function updateVersions(projectDir, pomFile) {
    echo ("Updating versions in pom file for project "+projectDir);
    var contents = fs.readFileSync(pomFile, 'utf-8');
    //console.log("Pom contents "+contents);
    var deps = getDependencies(projectDir);
    //console.log(deps);
    deps.forEach(function(dep) {
        var artifactStr = dep.artifactId.replace(/-/g, '.');
        var versionStr = dep.version;
        console.log("[mvnpm] Updating version of "+artifactStr+" to "+versionStr);
        var regexpStr = '<'+escapeRegExp(artifactStr)+'\\.version>.*</'+escapeRegExp(artifactStr)+'\\.version>';
        //console.log(regexpStr);
        contents = contents.replace(new RegExp(regexpStr),
            '<'+artifactStr+'.version>'+versionStr+'</'+artifactStr+'.version>'
        );
    });
    fs.writeFileSync(pomFile, contents, 'utf-8');
}

function addDependency(projectDir, url, version, subdir) {
    echo("[mvnpm] Adding dependency to "+url+" version "+version);
    version = version || 'master';
    cd(projectDir);
    config = {
        dependencies : []
    };
    
    var origConfigContents = fs.readFileSync(projectDir+'/mvnpm.json');
    if (test('-e', 'mvnpm.json')) {
        config = JSON.parse(origConfigContents);
    }
    
    if (!config.dependencies) {
        config.dependencies = [];
    }
    
    var mod = null;
    config.dependencies.forEach(function(curr) {
        if (mod !== null) {
            return;
        }
        if (curr.url == url) {
            mod = curr;
            
        }
    });
    if (mod === null) {
        mod = {url: url, version: version}
        if (subdir) {
            mod.path = subdir;
        }
        config.dependencies.push(mod);
    } else {
        mod.url = url;
        mod.version = version;
        if (subdir) {
            mod.path = subdir;
        }
    } 
    
    fs.writeFileSync(projectDir+'/mvnpm.json', JSON.stringify(config, null, '  '), 'utf-8');
    /*
    loadDependencies(projectDir, projectDir+'/.mvnpm');
    
    var loadedDeps = getDependencies(projectDir);
    
    
    // Now check the pom file to see if we need to add the dependency there.
    var pomFile = config.pom || 'pom.xml';
    var pomStr = fs.readFileSync(projectDir+"/"+pomFile, 'utf-8');
    //console.log("Pom is "+pomStr);
    parseString(pomStr, function(err, doc) {
        var project = doc.project;
        console.log(project);
        var found = false;
        if (project.dependencies) {
            var deps = project.dependencies;
            deps.forEach(function(dep) {
                if (dep.artifactId   
            });
        }
    });
    */
        
}


var doInstallDeps = false;
var doInstall = false;
var doAddDependency = false;
if (cmd == 'install') {
    doInstallDeps = true;
    doInstall = true;
} else if (cmd == 'install-deps') {
    doInstallDeps = true;
} else if (cmd == 'add') {
    doAddDependency = true;
} else {
    doInstallDeps = true;
}

echo("[mvnpm] mvnpm A simpler package manager for maven");
echo("[mvnpm] For more information see https://www.github.com/shannah/mvmpm");

if (doInstallDeps) {
    loadDependencies(currDir, mvnpmDir);
}
if (doInstall) {
    install(currDir, mvnpmDir);
}
if (doAddDependency) {
    if (process.argv.length < 4) {
        echo("No dependency specified");
        exit(1);
    
    }
    var addUrl = process.argv[3];
    
    var version = 'master';
    if (process.argv.length >= 5) {
        version = process.argv[4];
    }

    var subdir = null;
    if (process.argv.length >= 6) {
        subdir = process.argv[5];
    }

    addDependency(currDir, addUrl, version, subdir);
}


