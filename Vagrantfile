# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.require_version ">= 2.1.0"

Vagrant.configure(2) do |config|
  # The most common configuration options are documented and commented below.
  # For a complete reference, please see the online documentation at
  # https://docs.vagrantup.com.

  # Every Vagrant development environment requires a box. You can search for
  # boxes at https://atlas.hashicorp.com/search.
  config.vm.box = "ubuntu/xenial64"

  # Port Forwarding!
  # Redis
  config.vm.network "forwarded_port", guest: 6379, host: 43015

  # Create a private network, which allows host-only access to the machine
  # using a specific IP.
  # config.vm.network "private_network", ip: "192.168.33.10"

  # Create a public network, which generally matched to bridged network.
  # Bridged networks make the machine appear as another physical device on
  # your network.
  # config.vm.network "public_network"

  # Share an additional folder to the guest VM. The first argument is
  # the path on the host to the actual folder. The second argument is
  # the path on the guest to mount the folder. And the optional third
  # argument is a set of non-required options.
  # config.vm.synced_folder "folder", "/home/vagrant/folder"
  # ayy we'll just go to /vagrant why not

  # Provider-specific configuration so you can fine-tune various
  # backing providers for Vagrant. These expose provider-specific options.
  # Example for VirtualBox:
  #
  config.vm.provider "virtualbox" do |vb|
    # Display the VirtualBox GUI when booting the machine
    # vb.gui = true

    # Customize the amount of memory on the VM:
    vb.memory = "4294"

    # minimize clock skew errors
    vb.customize [ "guestproperty",
		   "set", :id,
		   "/VirtualBox/GuestAdd/VBoxService/--timesync-set-threshold", 10000 ]
  end
  #
  # View the documentation for the provider you are using for more
  # information on available options.

  # Define a Vagrant Push strategy for pushing to Atlas. Other push strategies
  # such as FTP and Heroku are also available. See the documentation at
  # https://docs.vagrantup.com/v2/push/atlas.html for more information.
  # config.push.define "atlas" do |push|
  #   push.app = "YOUR_ATLAS_USERNAME/YOUR_APPLICATION_NAME"
  # end

  # This is the default, but we need to define it explicitly for the env argument in the provisioner
  config.ssh.username = "vagrant"

  # Define a short script to make an unsynced node_modules folder within the synced tance folder.
  # This dramatically speeds up npm installs and removes the need for some other workarounds
  unsynced_node_modules_script = <<-SHELL
    node_modules_path="/vagrant/tance/node_modules"
    unsynced_node_modules_path="/vagrant/.unsynced_node_modules"
    sudo -u vagrant mkdir -p "$unsynced_node_modules_path"
    sudo -u vagrant mkdir -p "$node_modules_path"
    sudo mount --bind "$unsynced_node_modules_path" "$node_modules_path"
  SHELL

    config.vm.provider "virtualbox" do |v|
          v.customize ["setextradata", :id, "VBoxInternal2/SharedFoldersEnableSymlinksCreate/v-root", "1"]
    end

  # Enable provisioning with a shell script. Additional provisioners such as
  # Puppet, Chef, Ansible, Salt, and Docker are also available. Please see the
  # documentation for more information about their specific syntax and use.
  config.vm.provision "shell",
    inline: <<-SHELL
    set -e

    echo "Add Apt Sources (for Mongo)"
    sudo apt-get update

    echo "Install various sofware useful utilities and build deps"
    sudo apt-get install -y python-pip python-dev python-setuptools
    sudo apt-get install -y ack-grep vim dos2unix git curl build-essential gcc git
    sudo apt-get install -y make g++ libssl-dev
    sudo apt-get install -y libkrb5-dev
    sudo apt-get install -y ntpdate

    # Minimize clock skew errors that might disturb `make`; e.g. if it tries to process
    # a file that appears to be from the future
    echo "Syncing with time service"
    sudo ntpdate time.windows.com

    echo "Install docker"
    sudo apt-get install -y docker.io
    echo "Configure non-root access to docker for vagrant user"
    sudo gpasswd -a ubuntu docker
    sudo gpasswd -a vagrant docker
    sudo service docker restart
    newgrp docker

    echo "Get redis container"
    sudo docker pull redis

    echo "Making tance's node_modules, unsynced"
    #{unsynced_node_modules_script}

    echo "Install Node & NPM"
    curl -SL https://deb.nodesource.com/setup_9.x -o nodesource_setup.sh
    bash nodesource_setup.sh
    apt-get -y install nodejs

    echo "Use NPM to upgrade NPM"
    sudo npm install -g npm
    sudo npm install -g jake
    sudo npm install -g mocha

  SHELL

  # Normally we'd configure this to happen at boot with /etc/fstab, but I can't get that to work
  # within Vagrant for some reason
  config.trigger.after [:up, :resume, :reload] do |trigger|
    trigger.run_remote = {inline: unsynced_node_modules_script}
  end
end
